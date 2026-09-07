/**
 * Runs a worklet on every frame a Fishjam camera track captures.
 *
 * ```ts
 * import { getCameraFrameProcessor } from '@fishjam-cloud/react-native-webrtc';
 * import { attachCameraFrameCallback } from '@fishjam-cloud/react-native-webrtc-worklets';
 *
 * const processor = await getCameraFrameProcessor(cameraTrack);
 * const subscription = await attachCameraFrameCallback(processor, (frame) => {
 *   'worklet';
 *   render(frame.nativeBuffer, frame.width, frame.height);
 * });
 * // ...
 * subscription.remove();
 * ```
 */
import type { CameraFrameConsumer, CameraFrameProcessor } from '@fishjam-cloud/react-native-webrtc';
import { NativeModules } from 'react-native';
import { createWorkletRuntime, scheduleOnRuntime, type WorkletRuntime } from 'react-native-worklets';

export type CameraFramePixelFormat = 'nv12' | 'bgra8' | 'rgba8' | 'unknown';

/**
 * A camera frame handed to a {@link CameraFrameCallback}. The native buffer is
 * valid only until the callback returns, or until `release()` is called.
 */
export interface CameraFrame {
  /** `CVPixelBufferRef` on iOS, `AHardwareBuffer*` on Android, as a pointer value. */
  readonly nativeBuffer: bigint;
  readonly width: number;
  readonly height: number;
  readonly rotationDegrees: number;
  readonly isFrontCamera: boolean;
  readonly timestampNanoseconds: number;
  readonly pixelFormat: CameraFramePixelFormat;
  readonly isReleased: boolean;
  /** Hands the buffer back to the camera early. Safe to repeat. */
  release(): void;
}

/** A `'worklet'` function; it runs on the camera frame runtime, never on the JS thread. */
export type CameraFrameCallback = (frame: CameraFrame) => void;

export interface CameraFrameSubscription {
  /** Detaches from the track and clears the callback. Safe to repeat. */
  remove(): void;
}

interface CameraFrameConsumerHandle extends CameraFrameConsumer {
  bindRuntime(runtime: WorkletRuntime): void;
  setCallback(callback: CameraFrameCallback): void;
  clearCallback(): void;
}

interface FishjamWebrtcWorkletsBinding {
  createConsumer(): CameraFrameConsumerHandle;
}

interface FishjamWebrtcWorkletsNativeModule {
  install(): Promise<void>;
}

declare const global: {
  __fishjamWebrtcWorklets?: FishjamWebrtcWorkletsBinding;
};

const RUNTIME_NAME = 'FishjamCameraFrames';

interface CameraFrameRuntime {
  readonly consumer: CameraFrameConsumerHandle;
  readonly runtime: WorkletRuntime;
}

let runtimePromise: Promise<CameraFrameRuntime> | null = null;
let activeSubscription: CameraFrameSubscription | null = null;

function nativeModule(): FishjamWebrtcWorkletsNativeModule {
  const module = (NativeModules as { FishjamWebrtcWorklets?: FishjamWebrtcWorkletsNativeModule }).FishjamWebrtcWorklets;
  if (!module) {
    throw new Error(
      '@fishjam-cloud/react-native-webrtc-worklets is not linked. Install the package and rebuild the native app.',
    );
  }
  return module;
}

function describeInstallError(cause: unknown): Error {
  if (cause instanceof Error) {
    return (cause as { code?: string }).code === 'E_NO_JSI'
      ? new Error('Camera frame worklets require the New Architecture.')
      : cause;
  }
  return new Error(`Camera frame worklets install failed: ${String(cause)}`);
}

async function createCameraFrameRuntime(): Promise<CameraFrameRuntime> {
  await nativeModule().install();
  const binding = global.__fishjamWebrtcWorklets;
  if (!binding) {
    throw new Error('Camera frame worklets binding was not installed.');
  }
  const consumer = binding.createConsumer();
  const runtime = createWorkletRuntime({ name: RUNTIME_NAME });
  consumer.bindRuntime(runtime);
  return { consumer, runtime };
}

// One runtime and one consumer for the whole app: worklet runtimes cannot be
// destroyed, and each one owns a thread.
function ensureCameraFrameRuntime(): Promise<CameraFrameRuntime> {
  if (!runtimePromise) {
    runtimePromise = createCameraFrameRuntime().catch((cause: unknown) => {
      runtimePromise = null;
      throw describeInstallError(cause);
    });
  }
  return runtimePromise;
}

/**
 * Starts calling `callback` on the camera frame runtime for every frame the
 * processor's track captures. Only one callback can be attached at a time;
 * remove the previous subscription first.
 */
export async function attachCameraFrameCallback(
  processor: CameraFrameProcessor,
  callback: CameraFrameCallback,
): Promise<CameraFrameSubscription> {
  if (activeSubscription) {
    throw new Error('A camera frame callback is already attached. Remove it before attaching another.');
  }
  const { consumer, runtime } = await ensureCameraFrameRuntime();
  if (activeSubscription) {
    throw new Error('A camera frame callback is already attached. Remove it before attaching another.');
  }

  scheduleOnRuntime(runtime, () => {
    'worklet';
    consumer.setCallback(callback);
  });

  try {
    processor.attach(consumer);
  } catch (cause) {
    scheduleOnRuntime(runtime, () => {
      'worklet';
      consumer.clearCallback();
    });
    throw cause;
  }

  let removed = false;
  const subscription: CameraFrameSubscription = {
    remove() {
      if (removed) {
        return;
      }
      removed = true;
      if (activeSubscription === subscription) {
        activeSubscription = null;
      }
      processor.detach();
      scheduleOnRuntime(runtime, () => {
        'worklet';
        consumer.clearCallback();
      });
    },
  };
  activeSubscription = subscription;
  return subscription;
}
