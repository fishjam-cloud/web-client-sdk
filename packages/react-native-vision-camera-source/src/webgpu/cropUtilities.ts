/**
 * Crop math + a worklet-safe byte packer for the FrameCropParams uniform used by
 * {@link createCameraPassthroughPipeline} (and reusable by your own shaders).
 *
 * FrameCropParams byte layout (40 bytes), matching the WGSL struct
 * `{ sourceSize: vec2u, cropOrigin: vec2f, cropSize: vec2f, uvTransform: mat2x2f }`:
 *
 *   [0]   u32 sourceSize.x      [1]   u32 sourceSize.y
 *   [2]   f32 cropOrigin.x      [3]   f32 cropOrigin.y
 *   [4]   f32 cropSize.x        [5]   f32 cropSize.y
 *   [6..9] f32 uvTransform, column-major (m00, m01, m10, m11)
 */

/**
 * A center-crop of a source frame plus a UV-space orientation transform, in source pixels.
 * Produce one with {@link computeAspectFillCrop} or {@link computeSquareCrop}.
 *
 * @group WebGPU
 */
export interface FrameCrop {
  sourceWidth: number;
  sourceHeight: number;
  cropOriginX: number;
  cropOriginY: number;
  cropSizeX: number;
  cropSizeY: number;
  /** uvTransform matrix scalars in (m00, m01, m10, m11) order; identity when omitted at compute time. */
  uv00: number;
  uv01: number;
  uv10: number;
  uv11: number;
}

const FRAME_CROP_BYTES = 40;

/**
 * Packs a {@link FrameCrop} into the 40-byte FrameCropParams uniform layout (see the module doc).
 * Worklet-safe; upload the result with `device.queue.writeBuffer(buffer, 0, bytes)`.
 *
 * @group WebGPU
 */
export function packFrameCropParams(crop: FrameCrop): ArrayBuffer {
  'worklet';
  const buffer = new ArrayBuffer(FRAME_CROP_BYTES);
  const asUint32 = new Uint32Array(buffer);
  const asFloat32 = new Float32Array(buffer);
  asUint32[0] = crop.sourceWidth >>> 0;
  asUint32[1] = crop.sourceHeight >>> 0;
  asFloat32[2] = crop.cropOriginX;
  asFloat32[3] = crop.cropOriginY;
  asFloat32[4] = crop.cropSizeX;
  asFloat32[5] = crop.cropSizeY;
  asFloat32[6] = crop.uv00;
  asFloat32[7] = crop.uv01;
  asFloat32[8] = crop.uv10;
  asFloat32[9] = crop.uv11;
  return buffer;
}

/**
 * Center-crop of a (sourceWidth × sourceHeight) frame to the target aspect ratio (width/height).
 * A no-op full-frame crop when the source already has the target aspect. Worklet-safe.
 *
 * Feed it the upright camera size from the render context:
 * `computeAspectFillCrop(context.cameraWidth, context.cameraHeight, context.outputWidth / context.outputHeight)`.
 *
 * The optional `uv00..uv11` scalars form a UV-space transform applied around the frame center
 * (identity by default).
 *
 * @group WebGPU
 */
export function computeAspectFillCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetAspect: number,
  uv00: number = 1,
  uv01: number = 0,
  uv10: number = 0,
  uv11: number = 1,
): FrameCrop {
  'worklet';
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  if (sourceWidth / sourceHeight > targetAspect) {
    cropWidth = sourceHeight * targetAspect;
  } else {
    cropHeight = sourceWidth / targetAspect;
  }
  return {
    sourceWidth,
    sourceHeight,
    cropOriginX: Math.floor((sourceWidth - cropWidth) / 2),
    cropOriginY: Math.floor((sourceHeight - cropHeight) / 2),
    cropSizeX: cropWidth,
    cropSizeY: cropHeight,
    uv00,
    uv01,
    uv10,
    uv11,
  };
}

/**
 * Square center-crop of a (sourceWidth × sourceHeight) frame — the usual shape for square model
 * inputs. Worklet-safe. The optional `uv00..uv11` scalars are as in {@link computeAspectFillCrop}.
 *
 * @group WebGPU
 */
export function computeSquareCrop(
  sourceWidth: number,
  sourceHeight: number,
  uv00: number = 1,
  uv01: number = 0,
  uv10: number = 0,
  uv11: number = 1,
): FrameCrop {
  'worklet';
  const size = Math.min(sourceWidth, sourceHeight);
  return {
    sourceWidth,
    sourceHeight,
    cropOriginX: Math.floor((sourceWidth - size) / 2),
    cropOriginY: Math.floor((sourceHeight - size) / 2),
    cropSizeX: size,
    cropSizeY: size,
    uv00,
    uv01,
    uv10,
    uv11,
  };
}
