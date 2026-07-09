/**
 * HAND-TRACKING INFERENCE — runs OFF the VisionCamera frame thread.
 * ============================================================================
 *
 * The ExecuTorch detector + landmark inference and the tracking maths are the
 * heavy per-frame work. Running them synchronously inside the VisionCamera
 * frame worklet (the `lo.camera.frame` thread) deadlocks with Android's ART
 * garbage collector (`SuspendAll timeout` SIGABRT): that thread stays
 * continuously inside Hermes, so ART cannot suspend it for a Java-heap GC.
 *
 * So inference runs on a DEDICATED worklet runtime ({@link inferenceRuntime},
 * react-native-executorch's `defaultWorkletRuntime`), driven by a self-paced
 * poll loop:
 *
 *   frame worklet  --writes pixels-->  {@link HandPixelCell} (Synchronizable)
 *   inference loop  --reads latest-->  detector+landmarks -> {@link HandCursorCell}
 *
 * The frame worklet only extracts the downscaled pixels and writes them to the
 * shared cell (no JS-thread hop, no per-frame cross-runtime scheduling). A
 * `setTimeout` loop on the inference runtime picks up the latest frame by
 * sequence number, runs inference, and publishes the pinch cursor to the cell
 * the render worklet reads. Idle between frames, so the runtime's Hermes GC
 * runs in the gaps and ART can suspend it — which is what avoids the deadlock.
 *
 * Persistent state (models, tensors, tracked ROI, reused scratch buffers, the
 * cells, the loop generation) lives on this runtime's `globalThis` under
 * {@link GLOBAL_KEY} — a worklet's `globalThis` persists across scheduled work.
 */
import { defaultWorkletRuntime } from 'react-native-executorch';
import type { Model } from 'react-native-executorch';
import type { Synchronizable } from 'react-native-worklets';

import {
  computeCropTransform,
  computeLetterboxMapping,
  computeRoiFromDetectorTensors,
  cropLandmarksToFrame,
  landmarksToRoi,
  pinchRatio,
  type Roi,
} from './tracking';
import {
  runExecutorchDetectorInference,
  runExecutorchLandmarksInference,
} from './executorch/handInferenceWorklet';
import type { ExecutorchHandModelTensors } from './executorch/loadHandTrackingModels';
import { sampleRotatedCropTensor } from './handCpuFrameWorklet';

/** The dedicated thread inference runs on (separate from the frame thread). */
export const inferenceRuntime = defaultWorkletRuntime;

/** `globalThis` key for the persistent inference state on {@link inferenceRuntime}. */
const GLOBAL_KEY = '__charadesHandInference';

/**
 * Poll period (ms) for the inference loop. The frame worklet writes at the
 * throttled camera cadence (~10 Hz); polling a little faster keeps latency low
 * while idle wakeups stay cheap (one lock-free cell read).
 */
const POLL_MS = 40;

/** Pixel hand-off cell: the frame worklet writes the latest downscaled frame here. */
export interface HandPixelCell {
  seq: number;
  buffer: ArrayBuffer | null;
  width: number;
  height: number;
  pixelFormat: string;
}

/** The cursor cell the render worklet reads (see `useCharadesCameraEffect`). */
export interface HandCursorCell {
  seq: number;
  frameX: number;
  frameY: number;
  spaceWidth: number;
  pinched: boolean;
  valid: boolean;
}

interface HandInferenceState {
  running: boolean;
  gen: number;
  detectorModel: Model;
  landmarksModel: Model;
  tensors: ExecutorchHandModelTensors;
  palmAnchors: Float32Array;
  pixelCell: Synchronizable<HandPixelCell>;
  cursorSync: Synchronizable<HandCursorCell>;
  lastSeq: number;
  trackedRoi: Roi | null;
  cursorPinched: boolean;
  detectorTensor: Float32Array;
  rawBoxes: Float32Array;
  rawLogits: Float32Array;
  cropTensor: Float32Array;
  rawLandmarks: Float32Array;
  presenceScratch: Float32Array;
}

/**
 * Runs one inference over the latest pixel buffer and publishes a fresh cursor
 * (bumping `seq`) only when a hand is found. Mirrors the old frame-worklet
 * PHASE B: detect (only when no ROI is tracked) -> landmarks -> pinch cursor.
 */
function runHandInferenceStep(
  state: HandInferenceState,
  buffer: ArrayBuffer,
  width: number,
  height: number,
  pixelFormat: string,
): void {
  'worklet';
  const raw = { buffer, width, height, pixelFormat };

  // -- detect (only when no ROI is currently tracked): 192² letterbox --
  let roi = state.trackedRoi;
  if (roi == null) {
    const mapping = computeLetterboxMapping(width, height, 192);
    const inverseRatio = 1 / mapping.ratio;
    const letterboxAffine: [number, number, number, number, number, number] = [
      inverseRatio,
      0,
      (0.5 - mapping.padX) * inverseRatio - 0.5,
      0,
      inverseRatio,
      (0.5 - mapping.padY) * inverseRatio - 0.5,
    ];
    sampleRotatedCropTensor(raw, letterboxAffine, 192, state.detectorTensor);
    runExecutorchDetectorInference(
      state.detectorModel,
      state.tensors,
      state.detectorTensor,
      state.rawBoxes,
      state.rawLogits,
    );
    roi = computeRoiFromDetectorTensors(
      state.rawBoxes,
      state.rawLogits,
      state.palmAnchors,
      width,
      height,
      192,
    );
  }

  if (roi == null) {
    state.trackedRoi = null;
    return; // no hand this frame — let the render side age the cursor out
  }

  // -- landmarks: rotated 224² crop sampled from the same buffer --
  const cropTransform = computeCropTransform(roi, 224);
  sampleRotatedCropTensor(raw, cropTransform.cropToFrame, 224, state.cropTensor);
  runExecutorchLandmarksInference(
    state.landmarksModel,
    state.tensors,
    state.cropTensor,
    state.rawLandmarks,
    state.presenceScratch,
  );

  // 0.5 = MINIMUM_PRESENCE_SCORE
  if (state.presenceScratch[0] < 0.5) {
    state.trackedRoi = null;
    return;
  }

  const landmarks = cropLandmarksToFrame(
    state.rawLandmarks,
    cropTransform.cropToFrame,
  );
  state.trackedRoi = landmarksToRoi(landmarks);

  // -- pinch cursor: thumb/index midpoint + hysteresis (0.15 / 0.30) --
  const ratio = pinchRatio(landmarks);
  if (state.cursorPinched) {
    if (ratio > 0.3) {
      state.cursorPinched = false;
    }
  } else if (ratio < 0.15) {
    state.cursorPinched = true;
  }
  const cursorFrameX = (landmarks[4 * 3] + landmarks[8 * 3]) / 2;
  const cursorFrameY = (landmarks[4 * 3 + 1] + landmarks[8 * 3 + 1]) / 2;

  const previous = state.cursorSync.getDirty();
  state.cursorSync.setBlocking({
    seq: previous.seq + 1,
    frameX: cursorFrameX,
    frameY: cursorFrameY,
    spaceWidth: width,
    pinched: state.cursorPinched,
    valid: true,
  });
}

/**
 * Initializes state on {@link inferenceRuntime} and starts the self-paced poll
 * loop. Scheduled once (via runOnRuntime) when the models finish loading. A
 * generation counter makes a re-init supersede any previous loop.
 */
export function startCharadesHandInference(
  pixelCell: Synchronizable<HandPixelCell>,
  cursorSync: Synchronizable<HandCursorCell>,
  detectorModel: Model,
  landmarksModel: Model,
  tensors: ExecutorchHandModelTensors,
  palmAnchors: Float32Array,
): void {
  'worklet';
  const globals = globalThis as unknown as Record<string, unknown>;
  const previous = globals[GLOBAL_KEY] as HandInferenceState | undefined;
  const gen = (previous?.gen ?? 0) + 1;
  const state: HandInferenceState = {
    running: true,
    gen,
    detectorModel,
    landmarksModel,
    tensors,
    palmAnchors,
    pixelCell,
    cursorSync,
    lastSeq: 0,
    trackedRoi: null,
    cursorPinched: false,
    detectorTensor: new Float32Array(192 * 192 * 3),
    rawBoxes: new Float32Array(2016 * 18),
    rawLogits: new Float32Array(2016),
    cropTensor: new Float32Array(224 * 224 * 3),
    rawLandmarks: new Float32Array(63),
    presenceScratch: new Float32Array(1),
  };
  globals[GLOBAL_KEY] = state;

  const loop = () => {
    const current = globals[GLOBAL_KEY] as HandInferenceState | undefined;
    // A newer init (or a dispose) supersedes this loop.
    if (current == null || !current.running || current.gen !== gen) {
      return;
    }
    try {
      const cell = current.pixelCell.getDirty();
      if (cell.buffer != null && cell.seq !== current.lastSeq) {
        current.lastSeq = cell.seq;
        runHandInferenceStep(
          current,
          cell.buffer,
          cell.width,
          cell.height,
          cell.pixelFormat,
        );
      }
    } catch (error) {
      console.warn('[hand] inference loop failed: ' + String(error));
    }
    setTimeout(loop, POLL_MS);
  };
  loop();
}

/** Stops the poll loop so a torn-down session cannot publish stale cursors. */
export function disposeCharadesHandInference(): void {
  'worklet';
  const state = (globalThis as unknown as Record<string, unknown>)[GLOBAL_KEY] as
    | HandInferenceState
    | undefined;
  if (state != null) {
    state.running = false;
  }
}
