/**
 * CPU tensor sampling for the hand-tracking frame worklet.
 *
 * One bilinear sampler produces BOTH model inputs (the 192x192 detector
 * letterbox and the 224x224 rotated hand crop) straight from a raw pixel
 * buffer — nitro-image's own crop() is broken on iOS (ignores the requested
 * size) and its logical dimensions lie (screen-scale redraws), so nothing
 * here trusts anything except the RawPixelData's measured width/height.
 *
 * Workletized and fully self-contained (module scope does not exist inside
 * worklets).
 */

export interface RawPixels {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  pixelFormat: string;
}

function channelLayout(pixelFormat: string): [number, number, number, number] {
  'worklet';
  // [redOffset, greenOffset, blueOffset, bytesPerPixel]
  if (pixelFormat === 'BGRA' || pixelFormat === 'BGRX') {
    return [2, 1, 0, 4];
  }
  if (pixelFormat === 'RGBA' || pixelFormat === 'RGBX') {
    return [0, 1, 2, 4];
  }
  if (pixelFormat === 'ARGB' || pixelFormat === 'XRGB') {
    return [1, 2, 3, 4];
  }
  if (pixelFormat === 'ABGR' || pixelFormat === 'XBGR') {
    return [3, 2, 1, 4];
  }
  if (pixelFormat === 'RGB') {
    return [0, 1, 2, 3];
  }
  if (pixelFormat === 'BGR') {
    return [2, 1, 0, 3];
  }
  // unknown: assume RGBA and let the one-time format log surface it
  return [0, 1, 2, 4];
}

/**
 * Samples an affine-mapped square region out of a raw pixel buffer into a
 * cropSize x cropSize RGB float tensor — the CPU equivalent of
 * cv2.warpAffine (bilinear, black outside the frame). `cropToFrame` maps
 * crop pixels -> frame pixels ([a,b,c,d,e,f] with x' = a*x + b*y + c,
 * y' = d*x + e*y + f); pass a plain scale+offset affine for a letterbox or a
 * rotated affine (computeCropTransform().cropToFrame) for the hand crop.
 */
export function sampleRotatedCropTensor(
  raw: RawPixels,
  cropToFrame: [number, number, number, number, number, number],
  cropSize: number,
  outputTensor: Float32Array,
): void {
  'worklet';
  const [redOffset, greenOffset, blueOffset, bytesPerPixel] = channelLayout(
    raw.pixelFormat,
  );
  const bytes = new Uint8Array(raw.buffer);
  const frameWidth = raw.width;
  const frameHeight = raw.height;
  const rowStride = frameWidth * bytesPerPixel;
  const [a, b, c, d, e, f] = cropToFrame;

  let write = 0;
  for (let cropY = 0; cropY < cropSize; cropY += 1) {
    // incremental affine: start of the row, then step by the x-column axis
    let frameX = b * cropY + c;
    let frameY = e * cropY + f;
    for (let cropX = 0; cropX < cropSize; cropX += 1) {
      if (
        frameX < 0 ||
        frameY < 0 ||
        frameX > frameWidth - 1 ||
        frameY > frameHeight - 1
      ) {
        outputTensor[write] = 0;
        outputTensor[write + 1] = 0;
        outputTensor[write + 2] = 0;
      } else {
        const x0 = Math.floor(frameX);
        const y0 = Math.floor(frameY);
        const x1 = Math.min(x0 + 1, frameWidth - 1);
        const y1 = Math.min(y0 + 1, frameHeight - 1);
        const fractionX = frameX - x0;
        const fractionY = frameY - y0;

        const w00 = (1 - fractionX) * (1 - fractionY);
        const w10 = fractionX * (1 - fractionY);
        const w01 = (1 - fractionX) * fractionY;
        const w11 = fractionX * fractionY;

        const i00 = y0 * rowStride + x0 * bytesPerPixel;
        const i10 = y0 * rowStride + x1 * bytesPerPixel;
        const i01 = y1 * rowStride + x0 * bytesPerPixel;
        const i11 = y1 * rowStride + x1 * bytesPerPixel;

        outputTensor[write] =
          (bytes[i00 + redOffset] * w00 +
            bytes[i10 + redOffset] * w10 +
            bytes[i01 + redOffset] * w01 +
            bytes[i11 + redOffset] * w11) /
          255;
        outputTensor[write + 1] =
          (bytes[i00 + greenOffset] * w00 +
            bytes[i10 + greenOffset] * w10 +
            bytes[i01 + greenOffset] * w01 +
            bytes[i11 + greenOffset] * w11) /
          255;
        outputTensor[write + 2] =
          (bytes[i00 + blueOffset] * w00 +
            bytes[i10 + blueOffset] * w10 +
            bytes[i01 + blueOffset] * w01 +
            bytes[i11 + blueOffset] * w11) /
          255;
      }
      write += 3;
      frameX += a;
      frameY += d;
    }
  }
}
