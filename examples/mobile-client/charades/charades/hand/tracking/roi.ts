/**
 * Region-of-interest math: palm detection -> ROI (for the first landmark crop)
 * and landmarks -> ROI (for tracking the next frame without re-detecting).
 *
 * Both are ports of the lab's tflite_pipeline.py, which in turn ports
 * MediaPipe's own graph configs / calculators:
 *   - detection -> ROI: DetectionsToRects + RectTransformation
 *     (rotate wrist->middle-MCP to 90°, scale 2.6, shift -0.5 box heights
 *     along the hand's own axis)
 *   - landmarks -> ROI: HandLandmarksToRectCalculator + RectTransformation
 *     (rect from palm + proximal joints ONLY — no fingertips, so the crop does
 *     not shrink while pinching; rotation from wrist -> mean of
 *     index/middle/ring PIP joints; scale 2.0, shift -0.1)
 */
import {
  letterboxNormalizedToFrame,
  type LetterboxMapping,
} from './letterbox';

/** A rotated square crop region in frame pixels. */
export interface Roi {
  centerX: number;
  centerY: number;
  /** Side length of the square crop. */
  side: number;
  /** Rotation bringing the hand upright (radians). */
  theta: number;
}

// NOTE ON WORKLETS: both functions below run inside the VisionCamera frame
// worklet, where module scope does not exist — so they inline every constant
// as a local. These exported constants are the canonical documentation and are
// used by JS-side callers/tests. Keep them in sync with the function bodies.
export const DETECTION_ROI_SCALE = 2.6;
export const DETECTION_ROI_SHIFT_Y = -0.5;
export const TRACKING_ROI_SCALE = 2.0;
export const TRACKING_ROI_SHIFT_Y = -0.1;

/**
 * Converts a merged palm detection (18 numbers, letterbox-normalized — see
 * palmDecode.ts) into a rotated crop ROI in frame pixels.
 */
export function palmDetectionToRoi(
  detection: number[],
  mapping: LetterboxMapping,
): Roi {
  'worklet';
  // Palm-detector keypoint indices; scale/shift = DETECTION_ROI_SCALE/SHIFT_Y.
  const wristKeypoint = 0;
  const middleMcpKeypoint = 2;
  const detectionRoiScale = 2.6;
  const detectionRoiShiftY = -0.5;

  const [top, left, bottom, right] = detection;
  const cornerMin = letterboxNormalizedToFrame(mapping, left, top);
  const cornerMax = letterboxNormalizedToFrame(mapping, right, bottom);

  const wrist = letterboxNormalizedToFrame(
    mapping,
    detection[4 + wristKeypoint * 2],
    detection[5 + wristKeypoint * 2],
  );
  const middle = letterboxNormalizedToFrame(
    mapping,
    detection[4 + middleMcpKeypoint * 2],
    detection[5 + middleMcpKeypoint * 2],
  );
  const theta =
    Math.atan2(wrist[1] - middle[1], wrist[0] - middle[0]) - Math.PI / 2;

  let side = Math.max(cornerMax[0] - cornerMin[0], cornerMax[1] - cornerMin[1]);
  let centerX = (cornerMin[0] + cornerMax[0]) / 2;
  let centerY = (cornerMin[1] + cornerMax[1]) / 2;

  // shift along the hand's own axis, then expand
  const shift = detectionRoiShiftY * side;
  centerX += -Math.sin(theta) * shift;
  centerY += Math.cos(theta) * shift;
  side *= detectionRoiScale;
  return { centerX, centerY, side, theta };
}

/**
 * Converts the current frame's 21 landmarks (flat [x, y, z] * 21 in frame
 * pixels) into the next frame's crop ROI — MediaPipe's tracking shortcut that
 * avoids running the palm detector on every frame.
 */
export function landmarksToRoi(landmarks: Float32Array): Roi {
  'worklet';
  // Landmark indices in the 21-point hand topology; ROI rect uses palm +
  // proximal joints ONLY. Scale/shift = TRACKING_ROI_SCALE/SHIFT_Y.
  const trackingLandmarkIndices = [0, 1, 2, 3, 5, 6, 9, 10, 13, 14, 17, 18];
  const indexFingerPip = 6;
  const middleFingerPip = 10;
  const ringFingerPip = 14;
  const trackingRoiScale = 2.0;
  const trackingRoiShiftY = -0.1;

  // rotation: wrist -> weighted mean of index/middle/ring PIP joints
  const wristX = landmarks[0];
  const wristY = landmarks[1];
  let pipX =
    (landmarks[indexFingerPip * 3] + landmarks[ringFingerPip * 3]) / 2;
  let pipY =
    (landmarks[indexFingerPip * 3 + 1] + landmarks[ringFingerPip * 3 + 1]) /
    2;
  pipX = (pipX + landmarks[middleFingerPip * 3]) / 2;
  pipY = (pipY + landmarks[middleFingerPip * 3 + 1]) / 2;
  const theta = Math.PI / 2 - Math.atan2(-(pipY - wristY), pipX - wristX);

  // rect from palm + proximal joints only (fingertips excluded on purpose)
  let minimumX = Infinity;
  let minimumY = Infinity;
  let maximumX = -Infinity;
  let maximumY = -Infinity;
  for (const landmarkIndex of trackingLandmarkIndices) {
    const x = landmarks[landmarkIndex * 3];
    const y = landmarks[landmarkIndex * 3 + 1];
    minimumX = Math.min(minimumX, x);
    minimumY = Math.min(minimumY, y);
    maximumX = Math.max(maximumX, x);
    maximumY = Math.max(maximumY, y);
  }
  const axisAlignedCenterX = (minimumX + maximumX) / 2;
  const axisAlignedCenterY = (minimumY + maximumY) / 2;

  // bounds of the palm points in the hand's own (rotated) frame
  const cosReverse = Math.cos(-theta);
  const sinReverse = Math.sin(-theta);
  let projectedMinimumX = Infinity;
  let projectedMinimumY = Infinity;
  let projectedMaximumX = -Infinity;
  let projectedMaximumY = -Infinity;
  for (const landmarkIndex of trackingLandmarkIndices) {
    const relativeX = landmarks[landmarkIndex * 3] - axisAlignedCenterX;
    const relativeY = landmarks[landmarkIndex * 3 + 1] - axisAlignedCenterY;
    const projectedX = relativeX * cosReverse - relativeY * sinReverse;
    const projectedY = relativeX * sinReverse + relativeY * cosReverse;
    projectedMinimumX = Math.min(projectedMinimumX, projectedX);
    projectedMinimumY = Math.min(projectedMinimumY, projectedY);
    projectedMaximumX = Math.max(projectedMaximumX, projectedX);
    projectedMaximumY = Math.max(projectedMaximumY, projectedY);
  }
  const projectedCenterX = (projectedMinimumX + projectedMaximumX) / 2;
  const projectedCenterY = (projectedMinimumY + projectedMaximumY) / 2;
  const width = projectedMaximumX - projectedMinimumX;
  const height = projectedMaximumY - projectedMinimumY;

  // rotate the projected center back into frame coordinates
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  let centerX =
    projectedCenterX * cosTheta - projectedCenterY * sinTheta +
    axisAlignedCenterX;
  let centerY =
    projectedCenterX * sinTheta + projectedCenterY * cosTheta +
    axisAlignedCenterY;

  // RectTransformation: shift along the hand axis, square long, then scale
  const shift = trackingRoiShiftY * height;
  centerX += -sinTheta * shift;
  centerY += cosTheta * shift;
  const side = Math.max(width, height) * trackingRoiScale;
  return { centerX, centerY, side, theta };
}
