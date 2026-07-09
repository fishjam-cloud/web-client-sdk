import { forwardFrame, type MediaStream } from '@fishjam-cloud/react-native-webrtc';
import { useMemo } from 'react';
import {
  type CameraFrameOutput,
  type Frame,
  type FrameDroppedReason,
  type FrameOutputOptions,
  useFrameOutput,
} from 'react-native-vision-camera';

import { createFrameTimestampState, normalizeFrameTimestampNanoseconds } from './frameTimestamp';
import { useManagedCustomSource } from './internal/useManagedCustomSource';
import { useManagedForwardTrack } from './internal/useManagedForwardTrack';
import { rotationDegreesFromOrientation } from './orientation';

/**
 * Options for {@link useVisionCameraSource}. Also accepts every VisionCamera frame-output option
 * (`targetResolution`, `pixelFormat`, `dropFramesWhileBusy`, and so on) and passes it through.
 */
export interface UseVisionCameraSourceOptions extends Partial<FrameOutputOptions> {
  /**
   * Whether the source is live. While `false`, no track exists and nothing is published — the
   * declarative sibling of VisionCamera's `isActive`. Defaults to `true`.
   */
  enabled?: boolean;
  /**
   * Optional worklet called with every camera frame, after the frame has been sent to Fishjam —
   * run your frame-processor plugins (pose detection, OCR, …) here.
   *
   * The frame is valid only for the duration of this synchronous callback; the hook releases it
   * when the callback returns, so do not retain it. Keep the function's identity stable
   * (`useCallback` or module scope) — a new function every render forces VisionCamera to
   * re-register the frame callback.
   */
  onFrame?: (frame: Frame) => void;
  /** Called whenever the camera pipeline drops a frame; forwarded to VisionCamera. */
  onFrameDropped?: (reason: FrameDroppedReason) => void;
}

/** Result of {@link useVisionCameraSource}. */
export interface UseVisionCameraSourceResult {
  /**
   * The VisionCamera frame output driving this source. Plug it into your camera session:
   * `useCamera({ device, isActive, outputs: [frameOutput] })`.
   */
  frameOutput: CameraFrameOutput;
  /**
   * The published stream — render it with `RTCView` for a self-view. `null` until the
   * underlying track is ready (creation is asynchronous).
   */
  stream: MediaStream | null;
  /** Failure while creating the underlying track, if any. */
  error: Error | null;
}

/**
 * Publishes your VisionCamera feed to Fishjam.
 *
 * A sibling of `useCustomSource`: the hook creates the video track, publishes it under
 * `sourceId`, and cleans everything up on unmount. Each camera frame is handed to Fishjam
 * without copying its pixels. Must be used under `FishjamProvider`.
 *
 * ```tsx
 * const { frameOutput, stream } = useVisionCameraSource('my-camera');
 *
 * useVisionCamera({ device: cameraDevice, isActive: true, outputs: [frameOutput] });
 *
 * return stream ? <RTCView mediaStream={stream} objectFit="cover" /> : null;
 * ```
 *
 * To also run inference on the same frames, pass an {@link UseVisionCameraSourceOptions.onFrame | onFrame}
 * worklet. To render your own content into the published video with WebGPU, use
 * `useVisionCameraWebGpuSource` from `@fishjam-cloud/react-native-vision-camera-source/webgpu`
 * instead.
 *
 * @param sourceId Identifies this source among the peer's tracks, like in `useCustomSource`.
 * @param options See {@link UseVisionCameraSourceOptions}.
 * @group Hooks
 */
export function useVisionCameraSource<SourceId extends string>(
  sourceId: SourceId,
  options: UseVisionCameraSourceOptions = {},
): UseVisionCameraSourceResult {
  const { enabled = true, onFrame: userOnFrame, onFrameDropped, ...frameOutputOptions } = options;

  const { track, stream, error } = useManagedForwardTrack(enabled);
  useManagedCustomSource(sourceId, stream);

  const timestampState = useMemo(() => createFrameTimestampState(), []);

  const handleFrame = useMemo(() => {
    return (frame: Frame) => {
      'worklet';
      try {
        if (track != null) {
          const nativeBuffer = frame.getNativeBuffer();
          try {
            const timestampNanoseconds = normalizeFrameTimestampNanoseconds(timestampState, frame.timestamp);
            forwardFrame(track, {
              nativeBuffer: nativeBuffer.pointer,
              rotation: rotationDegreesFromOrientation(frame.orientation),
              // When the frame carries no usable timestamp, omit it — the native layer then
              // stamps the frame with its own monotonic clock.
              ...(timestampNanoseconds != null ? { timestampNs: timestampNanoseconds } : {}),
            });
          } finally {
            nativeBuffer.release();
          }
        }
        if (userOnFrame != null) {
          userOnFrame(frame);
        }
      } catch (cause) {
        console.warn('useVisionCameraSource: processing a camera frame failed: ' + String(cause));
      } finally {
        frame.dispose();
      }
    };
  }, [track, userOnFrame, timestampState]);

  const frameOutput = useFrameOutput({
    // 'native' keeps the pipeline copy-free; override via options if a plugin needs 'rgb'/'yuv'.
    pixelFormat: 'native',
    dropFramesWhileBusy: true,
    ...frameOutputOptions,
    onFrame: handleFrame,
    onFrameDropped,
  });

  return { frameOutput, stream, error };
}
