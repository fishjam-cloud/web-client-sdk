/// <reference types="@webgpu/types" />
import {
  type CameraFrameProcessor,
  getCameraFrameProcessor,
  type MediaStreamTrack,
} from '@fishjam-cloud/react-native-webrtc';

import { allocatePooledTrack, disposeAllocation, type PooledTrackAllocation } from '../internal/pooledTrackAllocation';
import type { CameraShaderBindings } from './cameraShaderBindings';
import type { WebGpuFrameRenderFunction } from './frameRenderContext';
import { createWebGpuFrameRenderer, type WebGpuFrameRenderer } from './webGpuFrameRenderLoop';

const DEFAULT_POOL_SIZE = 3;
const FRAME_FAILURES_LOGGED_VERBATIM = 3;
const FRAME_FAILURE_LOG_INTERVAL = 300;
// A plain box rather than a number: the frame worklet captures it by reference and counts there.
const frameFailureCounter = { count: 0 };
const FRAME_PROGRESS_LOG_INTERVAL = 60;
const frameProgressCounter = { count: 0 };

function describeFrameFailure(cause: unknown): string {
  'worklet';
  const errorLike = cause as { message?: unknown; stack?: unknown } | null;
  if (errorLike == null || typeof errorLike !== 'object') {
    return String(cause);
  }
  return `${String(errorLike.message)}\n${String(errorLike.stack)}`;
}

/**
 * What the per-frame worklet needs to know about the camera frame beyond the GPU textures the
 * render context already carries: its timestamp, which camera produced it, and its dimensions.
 * A plain object so it copies into the frame runtime.
 */
export interface CameraFrameInfo {
  /** Presentation timestamp of this frame, in nanoseconds. */
  readonly timestampNanoseconds: number;
  /** Whether the frame came from the front (self-view) camera. */
  readonly isFrontCamera: boolean;
  readonly width: number;
  readonly height: number;
  /** Clockwise rotation applied to bring the frame upright at import. */
  readonly rotationDegrees: 0 | 90 | 180 | 270;
}

/**
 * The per-frame drawing worklet. Called on the camera frame runtime for every admitted frame;
 * call `render(...)` at most once to draw this frame's output (skipping it drops the frame).
 * Inside `render` you receive a {@link WebGpuFrameRenderContext} with the live camera texture and
 * the output texture to draw into.
 */
export type CameraFrameKernel = (frame: CameraFrameInfo, render: WebGpuFrameRenderFunction) => void;

export interface CreateCameraFrameProcessorSessionOptions {
  /** Fishjam's own raw camera track, from `useCamera`'s middleware. */
  track: MediaStreamTrack;
  /** The shared, camera-import-capable GPUDevice (see `useCameraWebGpuDevice`). */
  device: GPUDevice;
  /** Width of the published video, in pixels. */
  width: number;
  /** Height of the published video, in pixels. */
  height: number;
  /** Number of in-flight output surfaces. Defaults to `3`. */
  poolSize?: number;
  /**
   * Camera shader bindings built with `createCameraShaderBindings` — always with
   * `cameraPixelLayout: 'rgb'`: the Fishjam camera tap delivers RGB on every platform (on Android
   * it converts the camera texture before handing it over). When set, the render context
   * carries a ready-made `cameraBindGroup` for the live camera texture every frame.
   */
  cameraShaderBindings?: CameraShaderBindings;
  /** The per-frame drawing worklet. See {@link CameraFrameKernel}. */
  frameKernel: CameraFrameKernel;
}

export interface CameraFrameProcessorSession {
  /** The pooled, effect-rendered video track to hand back from the camera track middleware. */
  readonly track: MediaStreamTrack;
  /** Detaches the camera tap and frees the pool. Idempotent. */
  dispose(): Promise<void>;
}

// Loaded lazily so an app that never uses camera effects does not need the worklets package
// installed. `require` (not `import`) keeps it out of the module graph until this runs.
interface CameraFrameConsumerModule {
  attachCameraFrameCallback: (
    processor: CameraFrameProcessor,
    callback: (frame: {
      readonly nativeBuffer: bigint;
      readonly rotationDegrees: number;
      readonly isFrontCamera: boolean;
      readonly timestampNanoseconds: number;
      readonly width: number;
      readonly height: number;
    }) => void,
  ) => Promise<{ remove(): void }>;
}

function loadCameraFrameConsumerModule(): CameraFrameConsumerModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@fishjam-cloud/react-native-webrtc-worklets') as CameraFrameConsumerModule;
  } catch (cause) {
    const error = new Error(
      'createCameraFrameProcessorSession needs @fishjam-cloud/react-native-webrtc-worklets. Install it and rebuild the native app.',
    );
    (error as { cause?: unknown }).cause = cause;
    throw error;
  }
}

function normalizeRotationDegrees(rotationDegrees: number): 0 | 90 | 180 | 270 {
  'worklet';
  if (rotationDegrees === 90 || rotationDegrees === 180 || rotationDegrees === 270) {
    return rotationDegrees;
  }
  return 0;
}

/**
 * Runs a WebGPU effect on Fishjam's own camera track and republishes the result as a pooled
 * video track. Hand the raw camera track in from a camera track middleware and return
 * `session.track`; the returned frames go out as the peer's camera track.
 *
 * The effect drawing lives in your `frameKernel`, a worklet run on the camera frame runtime for
 * every frame. The session owns everything else: the output surface pool, the native camera tap,
 * GPU synchronization with the encoder, and frame lifetimes (a frame is released for you once the
 * kernel returns).
 *
 * ```ts
 * setCameraTrackMiddleware(async (rawTrack) => {
 *   const session = await createCameraFrameProcessorSession({
 *     track: rawTrack, device, width: 720, height: 1280, frameKernel,
 *   });
 *   return { track: session.track, onClear: () => void session.dispose() };
 * });
 * ```
 */
export async function createCameraFrameProcessorSession(
  options: CreateCameraFrameProcessorSessionOptions,
): Promise<CameraFrameProcessorSession> {
  const { track, device, width, height, poolSize = DEFAULT_POOL_SIZE, cameraShaderBindings, frameKernel } = options;

  const { attachCameraFrameCallback } = loadCameraFrameConsumerModule();
  const processor = await getCameraFrameProcessor(track);

  let allocation: PooledTrackAllocation | null = null;
  let subscription: { remove(): void } | null = null;
  let disposed = false;

  try {
    allocation = await allocatePooledTrack(width, height, poolSize);
    const renderer: WebGpuFrameRenderer = createWebGpuFrameRenderer({
      device,
      track: allocation.track,
      bufferDescriptors: allocation.bufferDescriptors,
      cameraShaderBindings,
    });

    subscription = await attachCameraFrameCallback(processor, (cameraFrame) => {
      'worklet';
      try {
        const frameInfo: CameraFrameInfo = {
          timestampNanoseconds: cameraFrame.timestampNanoseconds,
          isFrontCamera: cameraFrame.isFrontCamera,
          width: cameraFrame.width,
          height: cameraFrame.height,
          rotationDegrees: normalizeRotationDegrees(cameraFrame.rotationDegrees),
        };
        renderer.renderFrame(
          {
            nativeBuffer: cameraFrame.nativeBuffer,
            rotationDegrees: frameInfo.rotationDegrees,
            // The published frame must carry the same pixels the raw camera track would: the
            // self-view mirrors a front camera on the RTCView, and remote peers see it as-is.
            isMirrored: false,
            timestampNanoseconds: cameraFrame.timestampNanoseconds,
          },
          (render) => {
            'worklet';
            frameKernel(frameInfo, render);
          },
        );
        if (__DEV__) {
          frameProgressCounter.count += 1;
          if (frameProgressCounter.count % FRAME_PROGRESS_LOG_INTERVAL === 0) {
            // eslint-disable-next-line no-console
            console.log(
              `createCameraFrameProcessorSession: rendered ${frameProgressCounter.count} camera frames (${frameInfo.width}x${frameInfo.height}, rotation ${frameInfo.rotationDegrees})`,
            );
          }
        }
      } catch (cause) {
        // An Error forwarded from the frame runtime loses its message, so describe it here. A
        // failure usually repeats on every frame; log the first few and then a sample, or the
        // warnings alone would saturate the JS thread.
        frameFailureCounter.count += 1;
        if (
          frameFailureCounter.count <= FRAME_FAILURES_LOGGED_VERBATIM ||
          frameFailureCounter.count % FRAME_FAILURE_LOG_INTERVAL === 0
        ) {
          console.warn(
            `createCameraFrameProcessorSession: processing a camera frame failed (#${frameFailureCounter.count}): ${describeFrameFailure(cause)}`,
          );
        }
      }
    });

    if (disposed) {
      // Disposed while attaching — undo everything we just built.
      subscription.remove();
      disposeAllocation(allocation);
      throw new Error('createCameraFrameProcessorSession: disposed before setup finished.');
    }

    const publishedTrack = allocation.stream.getVideoTracks()[0];
    if (publishedTrack == null) {
      subscription.remove();
      disposeAllocation(allocation);
      throw new Error('createCameraFrameProcessorSession: the pooled stream has no video track.');
    }
    const ownedAllocation = allocation;
    const ownedSubscription = subscription;

    return {
      track: publishedTrack,
      async dispose() {
        if (disposed) {
          return;
        }
        disposed = true;
        ownedSubscription.remove();
        disposeAllocation(ownedAllocation);
      },
    };
  } catch (cause) {
    disposed = true;
    subscription?.remove();
    if (allocation) {
      disposeAllocation(allocation);
    }
    throw cause;
  }
}
