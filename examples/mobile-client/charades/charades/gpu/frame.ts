/**
 * ported VERBATIM from the TypeGPU selfie-segmentation example
 * (`image-processing/selfie-segmentation/frame.ts`). Pure data/maths — fully
 * portable to RN with no changes. Describes the square center-crop + orientation
 * transform applied to the camera frame before it enters the CNN.
 */
import { d } from 'typegpu';

export interface VideoFrameCrop {
  sourceSize: [number, number];
  cropOrigin: [number, number];
  cropSize: [number, number];
  uvTransform: d.m2x2f;
}

export const FrameCropParams = d.struct({
  sourceSize: d.vec2u,
  cropOrigin: d.vec2f,
  cropSize: d.vec2f,
  uvTransform: d.mat2x2f,
});

export const initialFrameCropParams: VideoFrameCrop = {
  sourceSize: [1, 1],
  cropOrigin: [0, 0],
  cropSize: [1, 1],
  uvTransform: d.mat2x2f.identity(),
};

export function squareCrop(
  sourceWidth: number,
  sourceHeight: number,
  uvTransform: d.m2x2f,
): VideoFrameCrop {
  const size = Math.min(sourceWidth, sourceHeight);
  return {
    sourceSize: [sourceWidth, sourceHeight],
    cropOrigin: [
      Math.floor((sourceWidth - size) / 2),
      Math.floor((sourceHeight - size) / 2),
    ],
    cropSize: [size, size],
    uvTransform,
  };
}
