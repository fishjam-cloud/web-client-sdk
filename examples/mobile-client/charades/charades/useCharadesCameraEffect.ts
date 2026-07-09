/**
 * Live FRONT camera -> WebGPU/TypeGPU camera-passthrough composite -> streamed
 * over WebRTC as a custom `camera` track, with a local self-view.
 *
 * All the streaming plumbing (surface pool, custom track, publishing, GPU
 * fences, timestamps, frame lifetimes) lives in
 * `@fishjam-cloud/react-native-vision-camera-source`'s WebGPU source hook.
 * What remains here is charades-specific:
 *
 *   1. SETUP (JS thread, once): wrap the shared GPUDevice in a TypeGPU root and
 *      build the composite (camera passthrough + strokes overlay + cursor ring)
 *      into raw NativeObjects via `buildCharadesBundle`.
 *
 *   2. PER FRAME (VisionCamera frame worklet, via the hook's `render`): read the
 *      HandSource cursor, advance the brush segment, and replay the composite
 *      with `encodeCharadesFrame` into the hook-provided output texture. Live
 *      hand tracking runs after the draw and feeds the NEXT frames' cursor.
 */

import { type MediaStream } from '@fishjam-cloud/react-native-client';
import {
  computeAspectFillCrop,
  useCameraWebGpuDevice,
  useVisionCameraWebGpuSource,
  type WebGpuFrameRenderFunction,
} from '@fishjam-cloud/react-native-vision-camera-source/webgpu';
import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import { createSynchronizable, scheduleOnRuntime } from 'react-native-worklets';
import {
  HybridFrameConverter,
  useFrameOutput,
  useCamera as useVisionCamera,
  useCameraDevices,
  useCameraPermission,
  type Frame,
} from 'react-native-vision-camera';
import tgpu from 'typegpu';

import { buildCharadesBundle, type CharadesBundle } from './gpu/charadesPipeline';
import { encodeCharadesFrame } from './gpu/charadesWorklet';
import type { ExecutorchHandTrackingModels } from './hand/executorch/loadHandTrackingModels';
import type { HandSource } from './hand/HandSource';
import {
  createHandFrameExtractState,
  extractHandFramePixels,
  type HandFrameExtractInputs,
} from './hand/handTrackingWorklet';
import {
  disposeCharadesHandInference,
  inferenceRuntime,
  startCharadesHandInference,
} from './hand/handInferenceRuntime';
import { buildPalmAnchors } from './hand/tracking';

// Full-portrait output (9:16, matching the front camera) + small in-flight
// pool for the GPU fence path.
const OUTPUT_WIDTH = 540;
const OUTPUT_HEIGHT = 960;
const POOL_SIZE = 3;

// The custom-source id the processed feed is published under.
const CUSTOM_SOURCE_ID = 'charades';

// Must match MIRROR_IN_COMPOSITE in gpu/charadesPipeline.ts: when the composite
// flips X (iOS), camera-space cursor coordinates map into output space through
// the same flip; when it doesn't (Android, frames arrive already mirror-look),
// the mapping is direct.
const MIRRORED_IN_COMPOSITE = Platform.OS === 'ios';

// Charades-specific per-frame inputs captured by the onFrame worklet.
interface CharadesWorkletInputs {
  charades: CharadesBundle;
  // Only what the frame worklet needs to EXTRACT pixels; inference runs on a
  // separate runtime (see handInferenceRuntime.ts), initialized in setup.
  handExtract: HandFrameExtractInputs | null;
}

export interface UseCharadesCameraEffectResult {
  /** The local `camera` MediaStream for the self-view (null until running). */
  localStream: MediaStream | null;
  /** True once the GPUDevice has been acquired. */
  deviceReady: boolean;
  /** True once the VisionCamera permission is granted. */
  hasCameraPermission: boolean;
  /** True once the front camera device has been resolved. */
  cameraReady: boolean;
  /** True while the custom track is built and frames are being published. */
  isRunning: boolean;
  /** Human-readable status / error for the on-screen panel. */
  status: string;
  /** Request the camera permission (no-op if already granted). */
  requestCameraPermission: () => void;
}

/**
 * Drives the WebGPU camera-passthrough on/off via `enabled`. Mount inside a
 * screen rendered under the app's FishjamProvider so publishing works.
 *
 * `handSource` supplies the brush cursor: its Synchronizable `cursor` cell is
 * the only thing the onFrame worklet reads from it (the source's methods are
 * not worklet-serializable). Pass a referentially STABLE source (useMemo) so
 * the worklet's capture of `handSource.cursor` does not churn across renders.
 */
export function useCharadesCameraEffect(
  enabled: boolean,
  handSource: HandSource,
  /**
   * When supplied, the onFrame worklet runs live hand tracking every few
   * frames and drives the brush cursor from the pinch gesture (the touch
   * mock stays as fallback while no hand is tracked). Pass a referentially
   * stable value.
   */
  handTrackingModels: ExecutorchHandTrackingModels | null = null,
): UseCharadesCameraEffectResult {
  const { device, error: deviceError } = useCameraWebGpuDevice();

  // Capture ONLY the shared cursor cell (a worklet-serializable Synchronizable)
  // into a local so the onFrame closure closes over it — never `handSource`,
  // whose methods cannot cross the worklet boundary.
  const cursorSync = handSource.cursor;

  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraDevices = useCameraDevices();
  // Front camera for a selfie effect.
  const cameraDevice = useMemo(
    () =>
      cameraDevices.find((d) => d.position === 'front') ??
      cameraDevices.find((d) => d.position === 'back') ??
      cameraDevices[0],
    [cameraDevices],
  );

  // A Tabs screen stays MOUNTED when you switch tabs (unlike the source's
  // full-screen stack route), so gate the camera session on focus below —
  // otherwise the front camera keeps capturing + pushing frames (indicator on,
  // GPU/battery drain, peers still receiving) while another tab is shown.
  const isFocused = useIsFocused();

  // --- SETUP: build the TypeGPU pipeline when enabled and the device is ready. ---
  const [workletInputs, setWorkletInputs] = useState<CharadesWorkletInputs | null>(null);
  const [setupFailure, setSetupFailure] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !device) {
      return; // the previous run's cleanup already reset the state
    }
    let cancelled = false;
    // Built in a microtask (not the effect body) so state lands via callbacks,
    // never synchronously inside the effect.
    void Promise.resolve().then(() => {
      if (cancelled) {
        return;
      }
      try {
        const root = tgpu.initFromDevice({ device });
        const charades = buildCharadesBundle(root, OUTPUT_WIDTH, OUTPUT_HEIGHT);

        // Hand tracking: the frame worklet only needs the (boxed) frame
        // converter to extract pixels. The ExecuTorch inference runs on a
        // dedicated runtime, started in a separate effect below.
        const handExtract: HandFrameExtractInputs | null = handTrackingModels
          ? { boxedFrameConverter: NitroModules.box(HybridFrameConverter) }
          : null;

        if (!cancelled) {
          setWorkletInputs({ charades, handExtract });
          setSetupFailure(null);
        }
      } catch (error) {
        console.error('useCharadesCameraEffect: failed to build the pipeline', error);
        if (!cancelled) {
          setSetupFailure(String(error));
        }
      }
    });
    return () => {
      cancelled = true;
      setWorkletInputs(null);
    };
  }, [enabled, device, handTrackingModels]);

  // Worklet-side mutable state kept in plain boxes the onFrame closure mutates
  // across frames (same-runtime mutation persists): the previous brush position
  // (hasPrev gates drawing a line vs. a dot) and the last strokes-clear epoch we
  // acted on (bump-detected against the HandSource cursor to fire a one-shot wipe).
  const frameStateBox = useMemo(
    () => ({
      prevX: 0.5,
      prevY: 0.5,
      hasPrev: false,
      lastClearEpoch: 0,
      // Hand-cursor freshness, tracked render-side: a new sequence number from
      // the tracking output resets the age; the cursor stays authoritative for
      // up to 15 render frames (~500ms).
      lastHandSeq: 0,
      handAgeFrames: 1000,
    }),
    [],
  );

  // Frame-thread state: just the (lazily unboxed) converter + a throttle
  // counter. The heavy inference state lives on the inference runtime's
  // globalThis (see handInferenceRuntime.ts).
  const handFrameState = useMemo(() => createHandFrameExtractState(), []);
  // Pixel hand-off: the frame worklet writes the latest downscaled frame here;
  // the inference loop on the dedicated runtime reads it. A shared cell means no
  // per-frame JS-thread hop or cross-runtime scheduling from the frame worklet.
  const handPixelCell = useMemo(
    () =>
      createSynchronizable({
        seq: 0,
        buffer: null as ArrayBuffer | null,
        width: 0,
        height: 0,
        pixelFormat: '',
      }),
    [],
  );

  // Hand-cursor handoff between the two camera outputs. The tracking worklet
  // and the render worklet run on DIFFERENT worklet runtimes (one per camera
  // output), so plain boxes are not shared between them — a Synchronizable is
  // the cross-runtime cell, exactly like the touch mock's HandSource.cursor.
  const handCursorSync = useMemo(
    () =>
      createSynchronizable({
        seq: 0,
        frameX: 0,
        frameY: 0,
        spaceWidth: 1,
        pinched: false,
        valid: false,
      }),
    [],
  );

  // Start the inference poll loop on the dedicated runtime once the models are
  // ready (scheduled from the JS thread — scheduleOnRuntime cannot be called
  // from inside a worklet). The loop reads handPixelCell and publishes to
  // handCursorSync; dispose stops it on teardown.
  useEffect(() => {
    if (!handTrackingModels) {
      return;
    }
    scheduleOnRuntime(
      inferenceRuntime,
      startCharadesHandInference,
      handPixelCell,
      handCursorSync,
      handTrackingModels.detector,
      handTrackingModels.landmarks,
      handTrackingModels.tensors,
      buildPalmAnchors(),
    );
    return () => {
      scheduleOnRuntime(inferenceRuntime, disposeCharadesHandInference);
    };
  }, [handTrackingModels, handPixelCell, handCursorSync]);

  // --- HAND TRACKING output: a separate CPU-readable camera stream. The GPU
  // output's 'native' frames are PRIVATE (GPU-only) on many Android devices,
  // which the tracker's FrameConverter cannot read; this 'yuv' output is
  // CPU-readable on both platforms. Fresh cursors are published to the render
  // worklet through handCursorSync. ---
  const handTrackingOnFrame = useMemo(() => {
    return (frame: Frame) => {
      'worklet';
      try {
        const handExtract = workletInputs?.handExtract;
        if (handExtract == null) {
          return;
        }
        // Throttle to every 3rd frame (~10 Hz).
        handFrameState.frameTick += 1;
        if (handFrameState.frameTick % 3 !== 0) {
          return;
        }
        // Only the pixel extraction touches the Frame / runs here; the heavy
        // ExecuTorch inference + tracking runs on the inference runtime's poll
        // loop, fed this buffer via the shared cell. This keeps the frame thread
        // light (ART can suspend it) and takes the per-frame work off the JS
        // thread entirely (no runOnJS hop).
        const raw = extractHandFramePixels(handFrameState, handExtract, frame);
        if (raw == null) {
          return;
        }
        const previous = handPixelCell.getDirty();
        handPixelCell.setBlocking({
          seq: previous.seq + 1,
          buffer: raw.buffer,
          width: raw.width,
          height: raw.height,
          pixelFormat: raw.pixelFormat,
        });
      } catch (error) {
        console.warn('[hand] frame extract failed: ' + String(error));
      } finally {
        frame.dispose();
      }
    };
  }, [workletInputs, handFrameState, handPixelCell]);

  const handTrackingOutput = useFrameOutput({
    pixelFormat: 'yuv',
    dropFramesWhileBusy: true,
    onFrame: handTrackingOnFrame,
  });

  // --- PER FRAME: read cursor, draw brush + composite. ---
  const onFrame = useMemo(() => {
    return (frame: Frame, render: WebGpuFrameRenderFunction) => {
      'worklet';
      if (!workletInputs) {
        return; // pipeline not built yet — the hook drops the frame
      }
      const { charades } = workletInputs;

      render((context) => {
        // The camera texture arrives upright, so the crop is computed in the
        // post-rotation display size with an identity uvTransform. Center-crop
        // to the output aspect (a no-op when the camera is already 9:16).
        const crop = computeAspectFillCrop(
          context.cameraWidth,
          context.cameraHeight,
          context.outputWidth / context.outputHeight,
        );

        // --- HandSource cursor: cheap lock-free read of the last cursor
        // committed on the JS runtime. ---
        const cs = cursorSync.getDirty();

        // One-shot strokes clear: bump-detected via clearEpoch. Reset hasPrev
        // so the next segment starts a fresh dot instead of a line across the
        // wipe.
        let clearStrokes = false;
        if (cs.clearEpoch !== frameStateBox.lastClearEpoch) {
          clearStrokes = true;
          frameStateBox.lastClearEpoch = cs.clearEpoch;
          frameStateBox.hasPrev = false;
        }

        // --- Brush cursor: the hand tracker's pinch cursor (published by the
        // tracking output's worklet, in its working-buffer pixels) overrides
        // the touch mock while fresh. Freshness is tracked render-side by
        // sequence number (a new seq resets the age). Map buffer px ->
        // OUTPUT display uv exactly like the composite fragment:
        // cropUv = (p - cropOrigin)/cropSize, then mirror x. ---
        const hand = handCursorSync.getDirty();
        if (hand.seq !== frameStateBox.lastHandSeq) {
          frameStateBox.lastHandSeq = hand.seq;
          frameStateBox.handAgeFrames = 0;
        } else {
          frameStateBox.handAgeFrames += 1;
        }
        const handIsFresh = hand.valid && frameStateBox.handAgeFrames < 15;

        let curX = cs.x;
        let curY = cs.y;
        let penIsDown = cs.pinch;
        let penIsPresent = cs.present;
        if (handIsFresh) {
          const displayScale = context.cameraWidth / hand.spaceWidth;
          const cropX = (hand.frameX * displayScale - crop.cropOriginX) / crop.cropSizeX;
          curX = MIRRORED_IN_COMPOSITE ? 1 - cropX : cropX;
          curY = (hand.frameY * displayScale - crop.cropOriginY) / crop.cropSizeY;
          penIsDown = hand.pinched;
          penIsPresent = true;
        }

        // Link to the previous position only while the pen is actively down
        // and present, and not across a wipe — otherwise paint a dot so lines
        // don't connect across a lift/gap.
        const linkToPrev = frameStateBox.hasPrev && penIsPresent && penIsDown && !clearStrokes;
        const prevX = linkToPrev ? frameStateBox.prevX : curX;
        const prevY = linkToPrev ? frameStateBox.prevY : curY;
        // Radii are in v-units (fractions of the output height); `aspect`
        // keeps the brush and ring round on the non-square output.
        const outputAspect = context.outputWidth / context.outputHeight;
        const brush = {
          curX,
          curY,
          prevX,
          prevY,
          draw: penIsDown,
          radius: 0.025,
          color: [1, 0.2, 0.2] as [number, number, number],
          aspect: outputAspect,
        };
        // The aiming aid: a live (non-persistent) ring at the cursor while
        // a hand or touch cursor is present; slightly larger while drawing.
        const cursorIndicator = {
          x: curX,
          y: curY,
          radius: penIsDown ? 0.04 : 0.028,
          active: penIsPresent,
          aspect: outputAspect,
        };

        encodeCharadesFrame(
          charades,
          context.device,
          context.cameraTexture,
          // Reuse the hook's cached per-slot view — creating one per frame leaks
          // (GPUTextureView has no release API), see WebGpuFrameRenderContext.outputView.
          context.outputView,
          context.commandEncoder,
          crop,
          brush,
          clearStrokes,
          cursorIndicator,
        );

        // Advance worklet-side state for the next frame's stroke segment.
        // hasPrev holds only while the pen is present AND down, so lines never
        // connect across a lift/gap (or across a wipe — this frame's dot/clear
        // already handled that above).
        frameStateBox.prevX = curX;
        frameStateBox.prevY = curY;
        frameStateBox.hasPrev = penIsPresent && penIsDown;
      });
    };
  }, [workletInputs, cursorSync, frameStateBox, handCursorSync]);

  // The source hook owns the surface pool, the custom track, publishing under
  // CUSTOM_SOURCE_ID, GPU fences, and timestamps. videoType 'camera' tags the
  // track metadata.type === 'camera', so every receiver buckets it as cameraTrack.
  const {
    frameOutput,
    stream,
    error: sourceError,
  } = useVisionCameraWebGpuSource(CUSTOM_SOURCE_ID, {
    enabled,
    videoType: 'camera',
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    poolSize: POOL_SIZE,
    onFrame,
  });

  // VisionCamera is the sole physical-camera owner. Keep the hook called
  // unconditionally (hook order); only start the session once everything is ready.
  useVisionCamera({
    isActive:
      enabled && isFocused && hasPermission && workletInputs != null && stream != null && cameraDevice != null,
    device: cameraDevice as NonNullable<typeof cameraDevice>,
    // Two streams from one camera: the GPU composite ('native', PRIVATE-ok)
    // and the CPU-readable hand-tracking stream ('yuv'). NOTE: mirrorMode is
    // left at 'auto' deliberately — Android's 'on' implementation composes the
    // mirror through a different axis order than Dawn's import (the image
    // arrives upside-down); the selfie mirror is handled in the composite
    // shader instead (see MIRROR_IN_COMPOSITE in charadesPipeline).
    outputs: [frameOutput, handTrackingOutput],
  });

  const isRunning = enabled && workletInputs != null && stream != null;
  let status: string;
  if (!enabled) {
    status = 'Idle.';
  } else if (deviceError != null) {
    status = `GPU unavailable: ${deviceError.message}`;
  } else if (sourceError != null) {
    status = `Failed to start: ${sourceError.message}`;
  } else if (setupFailure != null) {
    status = `Failed to start: ${setupFailure}`;
  } else if (device == null) {
    status = 'Acquiring GPU device…';
  } else if (workletInputs == null) {
    status = 'Building camera pipeline…';
  } else if (stream == null) {
    status = 'Creating IOSurface-backed custom track…';
  } else {
    status = 'Running — waiting for camera frames…';
  }

  return {
    localStream: stream,
    deviceReady: Boolean(device),
    hasCameraPermission: hasPermission,
    cameraReady: cameraDevice != null,
    isRunning,
    status,
    requestCameraPermission: requestPermission,
  };
}
