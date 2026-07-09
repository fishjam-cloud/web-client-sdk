/**
 * Letterbox mapping between a full camera frame and the square detector input
 * (resize keeping aspect ratio + symmetric padding).
 *
 * Port of `letterbox` in the lab's tflite_pipeline.py — only the coordinate
 * mapping lives here; the actual pixel resampling is done by the platform
 * (GPU render pass on-device, cv2 in the lab).
 */

export interface LetterboxMapping {
  /** Square input size the frame is letterboxed into (e.g. 192). */
  size: number;
  /** Scale from frame pixels to letterbox pixels. */
  ratio: number;
  /** Horizontal padding in letterbox pixels (left side). */
  padX: number;
  /** Vertical padding in letterbox pixels (top side). */
  padY: number;
}

export function computeLetterboxMapping(
  frameWidth: number,
  frameHeight: number,
  size: number,
): LetterboxMapping {
  'worklet';
  const ratio = size / Math.max(frameWidth, frameHeight);
  const resizedWidth = Math.round(frameWidth * ratio);
  const resizedHeight = Math.round(frameHeight * ratio);
  return {
    size,
    ratio,
    padX: (size - resizedWidth) / 2,
    padY: (size - resizedHeight) / 2,
  };
}

/** Maps letterbox-normalized [0,1] coordinates back to frame pixels. */
export function letterboxNormalizedToFrame(
  mapping: LetterboxMapping,
  normalizedX: number,
  normalizedY: number,
): [frameX: number, frameY: number] {
  'worklet';
  return [
    (normalizedX * mapping.size - mapping.padX) / mapping.ratio,
    (normalizedY * mapping.size - mapping.padY) / mapping.ratio,
  ];
}
