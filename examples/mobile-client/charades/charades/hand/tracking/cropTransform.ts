/**
 * Affine transforms between the full frame and the rotated square hand crop.
 *
 * The lab used cv2.getAffineTransform on three ROI corners; here the same
 * matrices are built analytically. The forward transform maps frame pixels to
 * crop pixels (what the GPU/CPU warp applies); the inverse maps the landmark
 * model's crop-pixel outputs back into frame pixels.
 *
 * Matrices are row-major [a, b, c, d, e, f] representing
 *   x' = a*x + b*y + c
 *   y' = d*x + e*y + f
 */
import type { Roi } from './roi';

export const LANDMARK_INPUT_SIZE = 224;

/** Row-major 2x3 affine matrix. */
export type AffineTransform = [number, number, number, number, number, number];

export interface CropTransform {
  /** Frame pixels -> crop pixels. */
  frameToCrop: AffineTransform;
  /** Crop pixels -> frame pixels. */
  cropToFrame: AffineTransform;
  /**
   * The crop square's top-left / top-right / bottom-left corners in frame
   * pixels — the same three points the lab fed to cv2.getAffineTransform.
   */
  corners: [
    topLeft: [number, number],
    topRight: [number, number],
    bottomLeft: [number, number],
  ];
}

// NOTE: invertAffineTransform / applyAffineTransform are defined BEFORE
// computeCropTransform on purpose: the react-native-worklets babel transform
// turns function declarations into non-hoisted assignments and captures a
// workletized function's dependencies AT DEFINITION TIME — with the callee
// below the caller it captures `undefined` (observed on-device as
// "invertAffineTransform is not a function").
export function invertAffineTransform(
  transform: AffineTransform,
): AffineTransform {
  'worklet';
  const [a, b, c, d, e, f] = transform;
  const determinant = a * e - b * d;
  const inverseA = e / determinant;
  const inverseB = -b / determinant;
  const inverseD = -d / determinant;
  const inverseE = a / determinant;
  return [
    inverseA,
    inverseB,
    -(inverseA * c + inverseB * f),
    inverseD,
    inverseE,
    -(inverseD * c + inverseE * f),
  ];
}

export function applyAffineTransform(
  transform: AffineTransform,
  x: number,
  y: number,
): [number, number] {
  'worklet';
  return [
    transform[0] * x + transform[1] * y + transform[2],
    transform[3] * x + transform[4] * y + transform[5],
  ];
}

export function computeCropTransform(
  roi: Roi,
  outputSize: number = 224, // = LANDMARK_INPUT_SIZE (module scope is absent in worklets)
): CropTransform {
  'worklet';
  const half = roi.side / 2;
  const cosTheta = Math.cos(roi.theta);
  const sinTheta = Math.sin(roi.theta);

  // rotated square corners: local (-h,-h), (h,-h), (-h,h) around the center
  const corner = (localX: number, localY: number): [number, number] => [
    roi.centerX + (localX * cosTheta - localY * sinTheta),
    roi.centerY + (localX * sinTheta + localY * cosTheta),
  ];
  const topLeft = corner(-half, -half);
  const topRight = corner(half, -half);
  const bottomLeft = corner(-half, half);

  // crop -> frame is direct: frame = topLeft + columnAxis*cropX + rowAxis*cropY
  const scale = outputSize - 1;
  const columnAxisX = (topRight[0] - topLeft[0]) / scale;
  const columnAxisY = (topRight[1] - topLeft[1]) / scale;
  const rowAxisX = (bottomLeft[0] - topLeft[0]) / scale;
  const rowAxisY = (bottomLeft[1] - topLeft[1]) / scale;
  const cropToFrame: AffineTransform = [
    columnAxisX,
    rowAxisX,
    topLeft[0],
    columnAxisY,
    rowAxisY,
    topLeft[1],
  ];

  return {
    frameToCrop: invertAffineTransform(cropToFrame),
    cropToFrame,
    corners: [topLeft, topRight, bottomLeft],
  };
}
