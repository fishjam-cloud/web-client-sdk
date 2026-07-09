/**
 * Pinch detection from 21 hand landmarks (flat [x, y, z] * 21).
 *
 * Pinch = thumb tip (4) touching index tip (8). The distance is normalized by
 * a stable hand-size proxy (wrist 0 -> middle-finger MCP 9) so the metric is
 * invariant to how close the hand is to the camera. Hysteresis avoids flicker
 * at the on/off boundary. Port of the lab's pinch.py (thresholds hand-tuned
 * against the live webcam demo).
 */

// Canonical landmark indices (documentation + JS-side callers). The
// workletized functions below inline them — module scope is absent in worklets.
export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_TIP = 8;
export const MIDDLE_FINGER_MCP = 9;

export const PINCH_ON_THRESHOLD = 0.15;
export const PINCH_OFF_THRESHOLD = 0.3;

function distance(landmarks: Float32Array, a: number, b: number): number {
  'worklet';
  const deltaX = landmarks[a * 3] - landmarks[b * 3];
  const deltaY = landmarks[a * 3 + 1] - landmarks[b * 3 + 1];
  return Math.hypot(deltaX, deltaY);
}

/** Normalized thumb-index gap: low (~0.1-0.25) pinched, high (~0.8+) open. */
export function pinchRatio(landmarks: Float32Array): number {
  'worklet';
  // landmark indices inlined — module scope is absent in worklets
  const gap = distance(landmarks, 4 /* thumb tip */, 8 /* index tip */);
  const handScale = distance(landmarks, 0 /* wrist */, 9 /* middle MCP */);
  if (handScale < 1e-6) {
    return Infinity;
  }
  return gap / handScale;
}

/** Midpoint between the thumb and index tips — the brush cursor position. */
export function pinchMidpoint(
  landmarks: Float32Array,
): [x: number, y: number] {
  'worklet';
  const thumbTip = 4;
  const indexTip = 8;
  return [
    (landmarks[thumbTip * 3] + landmarks[indexTip * 3]) / 2,
    (landmarks[thumbTip * 3 + 1] + landmarks[indexTip * 3 + 1]) / 2,
  ];
}

/** Single-hand pinch state with hysteresis. */
export class PinchDetector {
  pinched = false;

  constructor(
    readonly onThreshold: number = PINCH_ON_THRESHOLD,
    readonly offThreshold: number = PINCH_OFF_THRESHOLD,
  ) {
    if (onThreshold >= offThreshold) {
      throw new Error('pinch onThreshold must be below offThreshold');
    }
  }

  update(landmarks: Float32Array): { pinched: boolean; ratio: number } {
    const ratio = pinchRatio(landmarks);
    if (this.pinched) {
      if (ratio > this.offThreshold) {
        this.pinched = false;
      }
    } else if (ratio < this.onThreshold) {
      this.pinched = true;
    }
    return { pinched: this.pinched, ratio };
  }

  reset(): void {
    this.pinched = false;
  }
}
