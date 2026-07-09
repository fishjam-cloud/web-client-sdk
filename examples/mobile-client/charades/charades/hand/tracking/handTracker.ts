/**
 * Detect-then-track hand tracking state machine — the top of the tracking
 * glue, mirroring the lab's RawMediaPipeHands.
 *
 * The palm detector runs ONLY when there is no hand to track; on subsequent
 * frames the crop ROI is derived from the previous frame's landmarks
 * (landmarksToRoi). Running the detector every frame is what makes naive hand
 * tracking lag — this shortcut is MediaPipe's own.
 *
 * All image/tensor IO is injected via HandTrackerFrameAccess so this module
 * stays pure math: the platform decides how to letterbox/warp pixels (GPU
 * render pass on-device) and how to run the models (react-native-executorch).
 */
import {
  computeCropTransform,
  type CropTransform,
} from './cropTransform';
import { cropLandmarksToFrame } from './landmarksDecode';
import { computeLetterboxMapping } from './letterbox';
import { buildPalmAnchors } from './palmAnchors';
import {
  decodePalmDetections,
  weightedNonMaxSuppression,
  DETECTOR_INPUT_SIZE,
} from './palmDecode';
import { landmarksToRoi, palmDetectionToRoi, type Roi } from './roi';

export const MINIMUM_PRESENCE_SCORE = 0.5;

/** Platform-provided pixel + model access for one frame. */
export interface HandTrackerFrameAccess {
  frameWidth: number;
  frameHeight: number;
  /**
   * Letterbox the frame to 192x192 (see computeLetterboxMapping) and run the
   * palm detector. Returns the two raw output tensors.
   */
  detectPalms(): { rawBoxes: Float32Array; rawLogits: Float32Array };
  /**
   * Warp the frame with `cropTransform.frameToCrop` into a 224x224 crop and
   * run the landmark model on it.
   */
  runLandmarks(cropTransform: CropTransform): {
    rawLandmarks: Float32Array;
    presence: number;
    handedness: number;
  };
}

export interface HandTrackingResult {
  /** Flat [x, y, z] * 21 in frame pixels. */
  landmarks: Float32Array;
  presence: number;
  handedness: number;
  /** True when this frame fell back to the palm detector. */
  usedDetector: boolean;
}

export class HandTracker {
  private readonly anchors = buildPalmAnchors();
  private trackedRoi: Roi | null = null;

  constructor(readonly track: boolean = true) {}

  reset(): void {
    this.trackedRoi = null;
  }

  update(frame: HandTrackerFrameAccess): HandTrackingResult | null {
    let roi = this.track ? this.trackedRoi : null;
    const usedDetector = roi == null;
    if (roi == null) {
      roi = this.detectPalmRoi(frame);
    }
    if (roi == null) {
      this.trackedRoi = null;
      return null;
    }

    const cropTransform = computeCropTransform(roi);
    const { rawLandmarks, presence, handedness } =
      frame.runLandmarks(cropTransform);
    if (presence < MINIMUM_PRESENCE_SCORE) {
      this.trackedRoi = null;
      return null;
    }

    const landmarks = cropLandmarksToFrame(
      rawLandmarks,
      cropTransform.cropToFrame,
    );
    this.trackedRoi = this.track ? landmarksToRoi(landmarks) : null;
    return { landmarks, presence, handedness, usedDetector };
  }

  private detectPalmRoi(frame: HandTrackerFrameAccess): Roi | null {
    const { rawBoxes, rawLogits } = frame.detectPalms();
    const detections = decodePalmDetections(rawBoxes, rawLogits, this.anchors);
    if (detections.length === 0) {
      return null;
    }
    const merged = weightedNonMaxSuppression(detections);
    let best = merged[0];
    for (const candidate of merged) {
      if (candidate.score > best.score) {
        best = candidate;
      }
    }
    const mapping = computeLetterboxMapping(
      frame.frameWidth,
      frame.frameHeight,
      DETECTOR_INPUT_SIZE,
    );
    return palmDetectionToRoi(best.detection, mapping);
  }
}
