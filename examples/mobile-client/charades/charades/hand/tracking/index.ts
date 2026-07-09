/**
 * Pure-TS hand-tracking glue around the two MediaPipe hand models —
 * a stage-by-stage port of the desktop lab's validated tflite_pipeline.py
 * (hand-pinch-lab), verified against its JSON fixtures. No React Native
 * imports; platform IO is injected (see HandTrackerFrameAccess).
 */
export { buildPalmAnchors, PALM_ANCHOR_COUNT } from './palmAnchors';
export {
  decodePalmDetections,
  weightedNonMaxSuppression,
  DETECTOR_INPUT_SIZE,
  MINIMUM_DETECTION_SCORE,
  NMS_SIMILARITY_THRESHOLD,
  type ScoredDetection,
} from './palmDecode';
export {
  computeLetterboxMapping,
  letterboxNormalizedToFrame,
  type LetterboxMapping,
} from './letterbox';
export {
  palmDetectionToRoi,
  landmarksToRoi,
  DETECTION_ROI_SCALE,
  DETECTION_ROI_SHIFT_Y,
  TRACKING_ROI_SCALE,
  TRACKING_ROI_SHIFT_Y,
  type Roi,
} from './roi';
export {
  computeCropTransform,
  invertAffineTransform,
  applyAffineTransform,
  LANDMARK_INPUT_SIZE,
  type AffineTransform,
  type CropTransform,
} from './cropTransform';
export {
  cropLandmarksToFrame,
  HAND_LANDMARK_COUNT,
} from './landmarksDecode';
export {
  pinchRatio,
  pinchMidpoint,
  PinchDetector,
  PINCH_ON_THRESHOLD,
  PINCH_OFF_THRESHOLD,
} from './pinch';
export {
  HandTracker,
  MINIMUM_PRESENCE_SCORE,
  type HandTrackerFrameAccess,
  type HandTrackingResult,
} from './handTracker';
export { computeRoiFromDetectorTensors } from './detectorRoi';
