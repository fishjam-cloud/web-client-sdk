/**
 * worklet-safe byte packer for the per-frame BrushParams uniform.
 *
 * Mirrors the package crop packer: the brush cursor is computed inside the VisionCamera
 * worklet, so we hand-pack the uniform bytes (tgpu's `d.struct` schema objects
 * carry functions and cannot be captured into a worklet) and upload them with
 * `device.queue.writeBuffer(...)`.
 *
 * Byte layout verified against tgpu 0.11.x WGSL uniform (std140-style) rules for
 *   BrushParams = d.struct({ cur, prev: vec2f, radius, draw, aspect: f32, color: vec3f })
 * with the installed typegpu: `d.sizeOf === 48`, `d.alignmentOf === 16`, and the
 * contiguous prefix is 28 bytes (cur..aspect) — so `color` (align 16) is padded
 * up to byte offset 32. All members are f32 / vec-of-f32, so a single
 * Float32Array view suffices:
 *
 *   BrushParams (48 bytes):
 *     f32[0]  cur.x     f32[1]  cur.y     // cur:    vec2f @ byte 0  (align 8)
 *     f32[2]  prev.x    f32[3]  prev.y    // prev:   vec2f @ byte 8  (align 8)
 *     f32[4]  radius                       // radius: f32   @ byte 16
 *     f32[5]  draw                         // draw:   f32   @ byte 20 (1 = paint, 0 = no-op)
 *     f32[6]  aspect                       // aspect: f32   @ byte 24
 *     f32[7]  <pad>                         //         pad   @ byte 28 (color aligns to 16)
 *     f32[8]  color.r  f32[9] color.g  f32[10] color.b  // color: vec3f @ byte 32 (align 16)
 *     f32[11] <pad>                         // struct tail pad → 48-byte size
 */
import { d } from 'typegpu';

// The brush uniform, drawn as a soft round capsule along the segment prev->cur.
export const BrushParams = d.struct({
  cur: d.vec2f,
  prev: d.vec2f,
  radius: d.f32,
  // 1 = painting this frame, 0 = no-op (fragment coverage collapses to 0).
  draw: d.f32,
  aspect: d.f32,
  color: d.vec3f,
});

// Zero-brush default used only to size/allocate the uniform buffer at setup; the
// worklet overwrites it every frame via `packBrushParams`.
export const initialBrushParams = {
  cur: d.vec2f(0, 0),
  prev: d.vec2f(0, 0),
  radius: 0,
  draw: 0,
  aspect: 1,
  color: d.vec3f(0, 0, 0),
};

// Plain-TS brush input consumed by `packBrushParams` (worklet-serializable: only
// numbers / a boolean / a number-triple, never a tgpu schema object).
export interface BrushInput {
  curX: number;
  curY: number;
  prevX: number;
  prevY: number;
  /** True while painting; packed to 1.0 (else 0.0 → the fragment paints nothing). */
  draw: boolean;
  radius: number;
  color: [number, number, number];
  aspect: number;
}

const BRUSH_PARAMS_BYTES = 48;

/** Packs BrushParams for the brush render pipeline's uniform. Worklet-safe. */
export function packBrushParams(brush: BrushInput): ArrayBuffer {
  'worklet';
  const buffer = new ArrayBuffer(BRUSH_PARAMS_BYTES);
  const f32 = new Float32Array(buffer);
  f32[0] = brush.curX;
  f32[1] = brush.curY;
  f32[2] = brush.prevX;
  f32[3] = brush.prevY;
  f32[4] = brush.radius;
  f32[5] = brush.draw ? 1 : 0;
  f32[6] = brush.aspect;
  // f32[7] is std140 alignment padding (color must start at byte 32).
  f32[8] = brush.color[0];
  f32[9] = brush.color[1];
  f32[10] = brush.color[2];
  // f32[11] is struct tail padding (48-byte size).
  return buffer;
}
