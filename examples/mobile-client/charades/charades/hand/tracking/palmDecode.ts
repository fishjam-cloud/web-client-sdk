/**
 * Palm-detector output decoding: raw SSD tensors -> scored detections ->
 * weighted non-max suppression.
 *
 * Port of the decode + NMS in the lab's tflite_pipeline.py (validated against
 * the MediaPipe Tasks API). Detection layout matches the Python exactly:
 *
 *   [ymin, xmin, ymax, xmax, kp0x, kp0y, …, kp6x, kp6y]   (18 numbers)
 *
 * All coordinates are normalized to the letterboxed detector input ([0, 1]).
 */

// NOTE ON WORKLETS: every function below runs inside the VisionCamera frame
// worklet, where module-scope constants DO NOT exist (react-native-worklets
// captures closure variables, but not module scope referenced from default
// parameters — and body references are fragile too). So the workletized
// functions inline these values as local literals; the exported constants are
// the canonical documentation and are used by JS-side callers/tests. Keep them
// in sync.
export const DETECTOR_INPUT_SIZE = 192;
export const MINIMUM_DETECTION_SCORE = 0.5;
export const NMS_SIMILARITY_THRESHOLD = 0.3;

export interface ScoredDetection {
  detection: number[];
  score: number;
}

/**
 * Decodes the raw detector outputs against the anchors, keeping only
 * detections whose sigmoid score clears `minimumScore`.
 *
 * @param rawBoxes   Float32Array of shape [2016, 18] flattened.
 * @param rawLogits  Float32Array of shape [2016].
 * @param anchors    Flat (x, y) anchor centers from buildPalmAnchors().
 */
export function decodePalmDetections(
  rawBoxes: Float32Array,
  rawLogits: Float32Array,
  anchors: Float32Array,
  minimumScore: number = 0.5, // = MINIMUM_DETECTION_SCORE
): ScoredDetection[] {
  'worklet';
  const size = 192; // = DETECTOR_INPUT_SIZE
  const detectionLength = 18;
  const palmKeypointCount = 7;
  const results: ScoredDetection[] = [];
  for (let index = 0; index < rawLogits.length; index += 1) {
    const clipped = Math.min(100, Math.max(-100, rawLogits[index]));
    const score = 1 / (1 + Math.exp(-clipped));
    if (score < minimumScore) {
      continue;
    }
    const base = index * detectionLength;
    const anchorX = anchors[index * 2];
    const anchorY = anchors[index * 2 + 1];

    const centerX = rawBoxes[base] / size + anchorX;
    const centerY = rawBoxes[base + 1] / size + anchorY;
    const halfWidth = rawBoxes[base + 2] / size / 2;
    const halfHeight = rawBoxes[base + 3] / size / 2;

    const detection = new Array<number>(detectionLength);
    detection[0] = centerY - halfHeight; // ymin
    detection[1] = centerX - halfWidth; // xmin
    detection[2] = centerY + halfHeight; // ymax
    detection[3] = centerX + halfWidth; // xmax
    for (let keypoint = 0; keypoint < palmKeypointCount; keypoint += 1) {
      detection[4 + keypoint * 2] = rawBoxes[base + 4 + keypoint * 2] / size + anchorX;
      detection[5 + keypoint * 2] = rawBoxes[base + 5 + keypoint * 2] / size + anchorY;
    }
    results.push({ detection, score });
  }
  return results;
}

function intersectionOverUnion(box: number[], other: number[]): number {
  'worklet';
  const top = Math.max(box[0], other[0]);
  const left = Math.max(box[1], other[1]);
  const bottom = Math.min(box[2], other[2]);
  const right = Math.min(box[3], other[3]);
  const intersection =
    Math.max(bottom - top, 0) * Math.max(right - left, 0);
  const areaOf = (b: number[]) => (b[2] - b[0]) * (b[3] - b[1]);
  const union = areaOf(box) + areaOf(other) - intersection;
  return intersection / Math.max(union, 1e-9);
}

/**
 * MediaPipe-style weighted NMS: overlapping detections are averaged (weighted
 * by score) instead of discarded. The merged detection's score is the maximum
 * of the overlapping scores — same as the Python reference.
 */
export function weightedNonMaxSuppression(
  detections: ScoredDetection[],
  similarityThreshold: number = 0.3, // = NMS_SIMILARITY_THRESHOLD
): ScoredDetection[] {
  'worklet';
  const detectionLength = 18;
  let remaining = [...detections].sort((a, b) => b.score - a.score);
  const merged: ScoredDetection[] = [];
  while (remaining.length > 0) {
    const best = remaining[0];
    const overlapping: ScoredDetection[] = [];
    const rest: ScoredDetection[] = [];
    for (const candidate of remaining) {
      const overlap = intersectionOverUnion(best.detection, candidate.detection);
      (overlap > similarityThreshold ? overlapping : rest).push(candidate);
    }
    remaining = rest;

    const weightSum = overlapping.reduce((sum, item) => sum + item.score, 0);
    const combined = new Array<number>(detectionLength).fill(0);
    let maximumScore = 0;
    for (const item of overlapping) {
      maximumScore = Math.max(maximumScore, item.score);
      for (let index = 0; index < detectionLength; index += 1) {
        combined[index] += item.detection[index] * item.score;
      }
    }
    for (let index = 0; index < detectionLength; index += 1) {
      combined[index] /= weightSum;
    }
    merged.push({ detection: combined, score: maximumScore });
  }
  return merged;
}
