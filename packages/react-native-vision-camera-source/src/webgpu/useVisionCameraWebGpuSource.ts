import { useManagedPooledTrack } from '@fishjam-cloud/react-native-custom-video-source';
import {
  type CameraShaderBindings,
  createWebGpuFrameRenderer,
  getWebGpuRuntime,
  useCameraWebGpuDeviceWithOverride,
  type WebGpuFrameRenderFunction,
} from '@fishjam-cloud/react-native-custom-video-source/webgpu';
import type { MediaStream } from '@fishjam-cloud/react-native-webrtc';
import { useMemo } from 'react';
import {
  type CameraFrameOutput,
  type Frame,
  type FrameDroppedReason,
  type FrameOutputOptions,
  useFrameOutput,
} from 'react-native-vision-camera';

import {
  createFrameTimestampState,
  DEFAULT_FRAME_INTERVAL_NANOSECONDS,
  nextFrameTimestampNanoseconds,
} from '../frameTimestamp';
import { usePublishedStream } from '../internal/usePublishedStream';
import { rotationDegreesFromOrientation } from '../orientation';

const DEFAULT_POOL_SIZE = 3;
const FRAME_FAILURES_LOGGED_VERBATIM = 3;
const FRAME_FAILURE_LOG_INTERVAL = 300;
// A plain box rather than a number: the frame worklet captures it by reference and counts there.
const frameFailureCounter = { count: 0 };

function describeFrameFailure(cause: unknown): string {
  'worklet';
  const errorLike = cause as { message?: unknown; stack?: unknown } | null;
  if (errorLike == null || typeof errorLike !== 'object') {
    return String(cause);
  }
  return `${String(errorLike.message)}\n${String(errorLike.stack)}`;
}

/**
 * Options for {@link useVisionCameraWebGpuSource}. Also accepts every VisionCamera frame-output
 * option except `pixelFormat`, which the hook forces to `'native'` (the zero-copy camera-import
 * path requires it).
 */
export interface UseVisionCameraWebGpuSourceOptions extends Partial<Omit<FrameOutputOptions, 'pixelFormat'>> {
  /**
   * Whether the source is live. While `false`, no track or surface pool exists and nothing is
   * published — the declarative sibling of VisionCamera's `isActive`. Defaults to `true`.
   */
  enabled?: boolean;
  /** Width of the published video, in pixels. */
  width: number;
  /** Height of the published video, in pixels. */
  height: number;
  /**
   * Number of in-flight output surfaces (a pushed frame may still be encoding while the next one
   * is drawn). Defaults to `3`.
   */
  poolSize?: number;
  /**
   * Bring your own GPUDevice instead of the shared one from `useCameraWebGpuDevice`. It is
   * validated against the required camera-import features; a device missing any of them surfaces
   * a descriptive `error` instead of failing per frame.
   */
  device?: GPUDevice;
  /**
   * Camera shader bindings built with `createCameraShaderBindings`, using
   * `visionCameraPixelLayout()` as the `cameraPixelLayout` (VisionCamera delivers raw YCbCr on
   * Android and RGB on iOS). When set, the render context carries a ready-made `cameraBindGroup`
   * for the live camera texture every frame.
   */
  cameraShaderBindings?: CameraShaderBindings;
  /**
   * Worklet called for every camera frame. Call `render(...)` at most once to draw this frame's
   * output; skipping it drops the frame (nothing is published for it). After `render(...)`
   * returns you may keep using `frame` (for example run inference) — but only until this
   * callback returns, when the hook releases the frame. Do not retain it. Keep the function's
   * identity stable (`useCallback` or module scope).
   */
  onFrame: (frame: Frame, render: WebGpuFrameRenderFunction) => void;
  /** Called whenever the camera pipeline drops a frame; forwarded to VisionCamera. */
  onFrameDropped?: (reason: FrameDroppedReason) => void;
  /**
   * Fallback spacing between published frames, in nanoseconds, used only when a camera frame
   * carries no usable timestamp. Defaults to 33,333,333 (30 fps).
   */
  frameIntervalNanoseconds?: number;
}

/** Options for {@link useVisionCameraWebGpuTrack}; the same as the source hook's. */
export type UseVisionCameraWebGpuTrackOptions = UseVisionCameraWebGpuSourceOptions;

/** Result of {@link useVisionCameraWebGpuSource} and {@link useVisionCameraWebGpuTrack}. */
export interface UseVisionCameraWebGpuSourceResult {
  /**
   * The VisionCamera frame output driving this source. Plug it into your camera session:
   * `useCamera({ device, isActive, outputs: [frameOutput] })`.
   */
  frameOutput: CameraFrameOutput;
  /**
   * The published stream — render it with `RTCView` for a self-view. `null` until the underlying
   * track is ready (creation is asynchronous).
   */
  stream: MediaStream | null;
  /** The GPUDevice in use — build your pipelines against it. `null` until acquired. */
  device: GPUDevice | null;
  /** WebGPU runtime, device acquisition, track creation, or publishing failure, if any. */
  error: Error | null;
}

/**
 * Publishes WebGPU-rendered video to Fishjam, fed by your VisionCamera feed.
 *
 * A sibling of `useCustomSource`: the hook creates the video track (and its pool of output
 * surfaces), publishes it under `sourceId`, and cleans everything up on unmount. Every camera
 * frame reaches your `onFrame` worklet, where calling `render(...)` hands you the live camera as
 * a GPU texture plus an output texture to draw into — what you draw is what peers receive.
 * Everything else is handled for you: output-surface management, GPU synchronization with the
 * video encoder, timestamps, rotation, and frame lifetimes. Must be used under `FishjamProvider`.
 *
 * ```tsx
 * const { frameOutput, stream, device } = useVisionCameraWebGpuSource('my-camera', {
 *   width: 720,
 *   height: 1280,
 *   cameraShaderBindings: effect?.cameraBindings,
 *   onFrame,
 * });
 * useVisionCamera({ device: cameraDevice, isActive: true, outputs: [frameOutput] });
 * ```
 *
 * To publish the camera unmodified (no rendering), use `useVisionCameraSource` from the package
 * root instead. For a ready-made camera→output pass to build on, see
 * `createCameraPassthroughPipeline`.
 *
 * @param sourceId Identifies this source among the peer's tracks, like in `useCustomSource`.
 * @param options See {@link UseVisionCameraWebGpuSourceOptions}.
 * @group Hooks
 */
export function useVisionCameraWebGpuSource<SourceId extends string>(
  sourceId: SourceId,
  options: UseVisionCameraWebGpuSourceOptions,
): UseVisionCameraWebGpuSourceResult {
  const result = useVisionCameraWebGpuTrack(options);
  usePublishedStream(sourceId, result.stream);
  return result;
}

/**
 * {@link useVisionCameraWebGpuSource} without the publishing: the same VisionCamera-fed, WebGPU
 * rendered pooled track, left for you to publish. Hand its video track back from a Fishjam
 * camera track middleware to make it the peer's camera track, or pass the stream to
 * `useCustomSource` yourself.
 *
 * @param options See {@link UseVisionCameraWebGpuTrackOptions}.
 * @group Hooks
 */
export function useVisionCameraWebGpuTrack(
  options: UseVisionCameraWebGpuTrackOptions,
): UseVisionCameraWebGpuSourceResult {
  const {
    enabled = true,
    width,
    height,
    poolSize = DEFAULT_POOL_SIZE,
    device: deviceOverride,
    cameraShaderBindings,
    onFrame: userOnFrame,
    onFrameDropped,
    frameIntervalNanoseconds = DEFAULT_FRAME_INTERVAL_NANOSECONDS,
    ...frameOutputOptions
  } = options;

  const { device, error: deviceError } = useCameraWebGpuDeviceWithOverride(deviceOverride);
  const {
    track,
    stream,
    bufferDescriptors,
    error: trackError,
  } = useManagedPooledTrack(enabled, width, height, poolSize);

  // getWebGpuRuntime throws when react-native-webgpu is missing/unlinked; surface that through
  // the hook's `error` (like device/track failures) instead of crashing the component render.
  const runtimeError = useMemo(() => {
    try {
      getWebGpuRuntime();
      return null;
    } catch (cause) {
      return cause instanceof Error ? cause : new Error(String(cause));
    }
  }, []);

  const timestampState = useMemo(() => createFrameTimestampState(), []);

  // Rebuilt whenever the track or device changes: a renderer owns per-slot shared-surface imports
  // made on the frame thread, and those belong to one (track, device) pair.
  const renderer = useMemo(() => {
    if (track == null || bufferDescriptors == null || device == null || runtimeError != null) {
      return null;
    }
    return createWebGpuFrameRenderer({ device, track, bufferDescriptors, cameraShaderBindings });
  }, [track, bufferDescriptors, device, cameraShaderBindings, runtimeError]);

  const handleFrame = useMemo(() => {
    return (frame: Frame) => {
      'worklet';
      try {
        if (renderer == null) {
          return;
        }
        const nativeBuffer = frame.getNativeBuffer();
        try {
          renderer.renderFrame(
            {
              nativeBuffer: nativeBuffer.pointer,
              rotationDegrees: rotationDegreesFromOrientation(frame.orientation),
              isMirrored: frame.isMirrored,
              timestampNanoseconds: nextFrameTimestampNanoseconds(
                timestampState,
                frame.timestamp,
                frameIntervalNanoseconds,
              ),
            },
            (render) => {
              'worklet';
              userOnFrame(frame, render);
            },
          );
        } finally {
          nativeBuffer.release();
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
            `useVisionCameraWebGpuSource: processing a camera frame failed (#${frameFailureCounter.count}): ${describeFrameFailure(cause)}`,
          );
        }
      } finally {
        frame.dispose();
      }
    };
  }, [renderer, userOnFrame, timestampState, frameIntervalNanoseconds]);

  const frameOutput = useFrameOutput({
    dropFramesWhileBusy: true,
    ...frameOutputOptions,
    // 'native' is required for the zero-copy camera import; VisionCamera converts the frames
    // (YUV→RGB, rotation) with any other format, and iOS Simulators cannot import the result.
    pixelFormat: 'native',
    onFrame: handleFrame,
    onFrameDropped,
  });

  return { frameOutput, stream, device, error: runtimeError ?? deviceError ?? trackError };
}
