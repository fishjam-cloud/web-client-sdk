/**
 * Landmark-model output decoding: the raw 63-value tensor (21 x (x, y, z) in
 * crop pixels) mapped back into frame pixels through the crop's inverse
 * affine. z is passed through unchanged (relative depth, same units).
 */
import {
  applyAffineTransform,
  type AffineTransform,
} from './cropTransform';

export const HAND_LANDMARK_COUNT = 21;

/**
 * @param rawLandmarks Float32Array of 63 values from the landmark model.
 * @param cropToFrame  Inverse crop affine from computeCropTransform().
 * @returns flat [x, y, z] * 21 in frame pixels.
 */
export function cropLandmarksToFrame(
  rawLandmarks: Float32Array,
  cropToFrame: AffineTransform,
): Float32Array {
  'worklet';
  const landmarkCount = 21; // = HAND_LANDMARK_COUNT (module scope absent in worklets)
  const frameLandmarks = new Float32Array(landmarkCount * 3);
  for (let index = 0; index < landmarkCount; index += 1) {
    const [frameX, frameY] = applyAffineTransform(
      cropToFrame,
      rawLandmarks[index * 3],
      rawLandmarks[index * 3 + 1],
    );
    frameLandmarks[index * 3] = frameX;
    frameLandmarks[index * 3 + 1] = frameY;
    frameLandmarks[index * 3 + 2] = rawLandmarks[index * 3 + 2];
  }
  return frameLandmarks;
}
