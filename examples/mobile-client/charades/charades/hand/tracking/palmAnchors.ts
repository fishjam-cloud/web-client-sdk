/**
 * SSD anchors for the 192x192 MediaPipe palm detector.
 *
 * Config from mediapipe palm_detection: 4 layers, strides [8,16,16,16],
 * aspect ratio 1.0 + interpolated scale => 2 anchors per cell, fixed size.
 * Grids: 24x24x2 + 12x12x(3 layers x 2) = 1152 + 864 = 2016 anchors.
 * With fixed_anchor_size, only the (x, y) centers matter; w = h = 1.
 *
 * Port of `build_palm_anchors` in the lab's tflite_pipeline.py (validated
 * against the MediaPipe Tasks API).
 */

export const PALM_ANCHOR_COUNT = 2016;

const GRID_LAYOUT: [gridSize: number, anchorsPerCell: number][] = [
  [24, 2],
  [12, 6],
];

/** Returns a flat Float32Array of (x, y) anchor centers: [x0, y0, x1, y1, …]. */
export function buildPalmAnchors(): Float32Array {
  const anchors = new Float32Array(PALM_ANCHOR_COUNT * 2);
  let offset = 0;
  for (const [gridSize, anchorsPerCell] of GRID_LAYOUT) {
    for (let row = 0; row < gridSize; row += 1) {
      for (let column = 0; column < gridSize; column += 1) {
        const centerX = (column + 0.5) / gridSize;
        const centerY = (row + 0.5) / gridSize;
        for (let anchor = 0; anchor < anchorsPerCell; anchor += 1) {
          anchors[offset] = centerX;
          anchors[offset + 1] = centerY;
          offset += 2;
        }
      }
    }
  }
  return anchors;
}
