/**
 * Detection stage glue: raw palm-detector output tensors -> best merged
 * detection -> crop ROI in frame pixels. Returns null when no palm clears the
 * score threshold. Pure math, workletized (self-contained — module scope does
 * not exist inside worklets).
 */
import { computeLetterboxMapping } from './letterbox';
import {
  decodePalmDetections,
  weightedNonMaxSuppression,
} from './palmDecode';
import { palmDetectionToRoi, type Roi } from './roi';

export function computeRoiFromDetectorTensors(
  rawBoxes: Float32Array,
  rawLogits: Float32Array,
  palmAnchors: Float32Array,
  frameWidth: number,
  frameHeight: number,
  detectorInputSize: number,
): Roi | null {
  'worklet';
  const detections = decodePalmDetections(rawBoxes, rawLogits, palmAnchors);
  if (detections.length === 0) {
    return null;
  }
  const merged = weightedNonMaxSuppression(detections);
  let best = merged[0];
  for (let index = 1; index < merged.length; index += 1) {
    if (merged[index].score > best.score) {
      best = merged[index];
    }
  }
  const mapping = computeLetterboxMapping(
    frameWidth,
    frameHeight,
    detectorInputSize,
  );
  return palmDetectionToRoi(best.detection, mapping);
}
