import { useManagedPooledTrack } from '@fishjam-cloud/react-native-custom-video-source';
import {
  type CameraShaderBindings,
  createCameraBindGroup,
  getOutputSurfaceFormat,
  getWebGpuRuntime,
  useCameraWebGpuDeviceWithOverride,
  type WebGpuFrameRenderContext,
  type WebGpuFrameRenderFunction,
} from '@fishjam-cloud/react-native-custom-video-source/webgpu';
import { type MediaStream, pushFrame } from '@fishjam-cloud/react-native-webrtc';
import { useMemo } from 'react';
import {
  type CameraFrameOutput,
  type Frame,
  type FrameDroppedReason,
  type FrameOutputOptions,
  useFrameOutput,
} from 'react-native-vision-camera';
import { type GPUSharedTextureMemory, GPUTextureUsage } from 'react-native-webgpu';

import { createFrameTimestampState, nextFrameTimestampNanoseconds } from '../frameTimestamp';
import { usePublishedStream } from '../internal/usePublishedStream';
import { rotationDegreesFromOrientation } from '../orientation';

const DEFAULT_POOL_SIZE = 3;
const DEFAULT_FRAME_INTERVAL_NANOSECONDS = 33_333_333; // 30 fps fallback cadence

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
   * Camera shader bindings built with `createCameraShaderBindings`. When set, the render context
   * carries a ready-made `cameraBindGroup` for the live camera texture every frame.
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

/** Result of {@link useVisionCameraWebGpuSource}. */
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
  usePublishedStream(sourceId, stream);

  // getWebGpuRuntime throws when react-native-webgpu is missing/unlinked; surface that through
  // the hook's `error` (like device/track failures) instead of crashing the component render.
  const { runtime, runtimeError } = useMemo(() => {
    try {
      return { runtime: getWebGpuRuntime(), runtimeError: null };
    } catch (cause) {
      return { runtime: null, runtimeError: cause instanceof Error ? cause : new Error(String(cause)) };
    }
  }, []);
  const outputSurfaceFormat = getOutputSurfaceFormat();
  // Captured as a plain number: the worklet must not close over the GPUTextureUsage namespace.
  const renderAttachmentUsage = GPUTextureUsage.RENDER_ATTACHMENT;

  const timestampState = useMemo(() => createFrameTimestampState(), []);

  // Worklet-side per-source state. Plain boxes copied into the worklet closure on (re-)creation:
  // the frame thread's copy carries the pool cursor and the per-slot shared-surface imports
  // (importSharedTextureMemory + begin/endAccess must all run on the frame runtime). Keyed by
  // [track, device] so a new track or device starts from an empty cache and never touches stale
  // imports. Imports abandoned by a replaced closure are released by the frame runtime's GC; the
  // deterministic alternative (import + destroy every frame) costs an import per frame — switch
  // to it if leak measurements ever demand.
  const workletState = useMemo(() => {
    // track/device are not read here — the `void`s mark them as intentional reset-only deps.
    void track;
    void device;
    return {
      poolCursor: 0,
      importedByIndex: {} as Record<
        number,
        { memory: GPUSharedTextureMemory; texture: GPUTexture; view: GPUTextureView }
      >,
    };
  }, [track, device]);

  const handleFrame = useMemo(() => {
    return (frame: Frame) => {
      'worklet';
      try {
        if (track == null || bufferDescriptors == null || device == null || runtime == null) {
          return;
        }
        const nativeBuffer = frame.getNativeBuffer();
        try {
          const videoFrame = runtime.createVideoFrameFromNativeBuffer(nativeBuffer.pointer);
          try {
            const rotationDegrees = rotationDegreesFromOrientation(frame.orientation);
            const isRotatedQuarterTurn = rotationDegrees === 90 || rotationDegrees === 270;
            const cameraWidth = isRotatedQuarterTurn ? videoFrame.height : videoFrame.width;
            const cameraHeight = isRotatedQuarterTurn ? videoFrame.width : videoFrame.height;

            const cameraTexture = device.importExternalTexture({
              // react-native-webgpu accepts its NativeVideoFrame here at runtime, but its type
              // declarations don't widen the descriptor's `source`, so cast.
              source: videoFrame as unknown as VideoFrame,
              label: 'fishjam-camera-frame',
              rotation: rotationDegrees,
              mirrored: frame.isMirrored,
            });
            try {
              const cameraBindGroup =
                cameraShaderBindings != null
                  ? createCameraBindGroup(device, cameraShaderBindings, cameraTexture)
                  : undefined;

              let rendered = false;
              const render: WebGpuFrameRenderFunction = (encode) => {
                'worklet';
                if (rendered) {
                  throw new Error('useVisionCameraWebGpuSource: render() may only be called once per frame.');
                }
                rendered = true;

                const cursor = workletState.poolCursor;
                workletState.poolCursor = (cursor + 1) % bufferDescriptors.length;
                const descriptor = bufferDescriptors[cursor];

                let imported = workletState.importedByIndex[descriptor.index];
                if (imported == null) {
                  const memory = device.importSharedTextureMemory({ handle: descriptor.surfaceHandle });
                  const texture = memory.createTexture({
                    format: outputSurfaceFormat,
                    size: [descriptor.width, descriptor.height],
                    usage: renderAttachmentUsage,
                  });
                  // Build the output view ONCE per pool slot and reuse it every frame: a
                  // GPUTextureView has no release API, so a per-frame createView() leaks native
                  // wrappers on the frame runtime until GC.
                  imported = { memory, texture, view: texture.createView() };
                  workletState.importedByIndex[descriptor.index] = imported;
                }

                imported.memory.beginAccess(imported.texture, false);
                let accessResult;
                try {
                  const commandEncoder = device.createCommandEncoder();
                  const context: WebGpuFrameRenderContext = {
                    device,
                    queue: device.queue,
                    commandEncoder,
                    cameraTexture,
                    cameraBindGroup,
                    outputTexture: imported.texture,
                    outputView: imported.view,
                    outputWidth: descriptor.width,
                    outputHeight: descriptor.height,
                    cameraWidth,
                    cameraHeight,
                    cameraIsMirrored: frame.isMirrored,
                  };
                  encode(context);
                  device.queue.submit([commandEncoder.finish()]);
                } finally {
                  // Always end the access scope — leaving a slot acquired after a throw would
                  // poison it for every later frame.
                  accessResult = imported.memory.endAccess(imported.texture);
                }

                const fenceState = accessResult.fences[0];
                const timestampNanoseconds = nextFrameTimestampNanoseconds(
                  timestampState,
                  frame.timestamp,
                  frameIntervalNanoseconds,
                );

                // Push directly from the worklet — native retains the fence synchronously here,
                // so no JS-side fence retention is needed. Rotation is 0: the camera was already
                // rotated upright at import time.
                pushFrame(track, {
                  bufferIndex: descriptor.index,
                  timestampNs: timestampNanoseconds,
                  rotation: 0,
                  ...(fenceState != null
                    ? { fence: { handle: fenceState.fence.export().handle, signaledValue: fenceState.signaledValue } }
                    : {}),
                });
              };

              userOnFrame(frame, render);
            } finally {
              // End the camera texture's access window now — waiting for GC would starve the
              // camera frame buffer pool.
              cameraTexture.destroy();
            }
          } finally {
            videoFrame.release();
          }
        } finally {
          nativeBuffer.release();
        }
      } catch (cause) {
        console.warn('useVisionCameraWebGpuSource: processing a camera frame failed', cause);
      } finally {
        frame.dispose();
      }
    };
  }, [
    track,
    bufferDescriptors,
    device,
    runtime,
    cameraShaderBindings,
    userOnFrame,
    workletState,
    timestampState,
    outputSurfaceFormat,
    renderAttachmentUsage,
    frameIntervalNanoseconds,
  ]);

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
