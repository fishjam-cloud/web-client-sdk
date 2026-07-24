import { GPUTextureUsage } from 'react-native-webgpu';

import { createCameraPassthroughPipeline, encodeCameraPassthrough } from './cameraPassthroughPipeline';
import { computeAspectFillCrop } from './cropUtilities';

/**
 * An owned `rgba8unorm` texture the camera frame is resolved into each frame — for pipelines that
 * want a plain `texture_2d` camera instead of `texture_external`. Build once at setup with
 * {@link createCameraTextureResolver}; every field is safe to capture into the frame worklet.
 *
 * Prefer sampling the camera directly via {@link createCameraShaderBindings} when you can: the
 * resolver costs one extra render pass per frame.
 *
 * @group WebGPU
 */
export interface CameraTextureResolver {
  /** The resolved camera texture (`rgba8unorm`, sampled + render-attachment usage). */
  readonly texture: GPUTexture;
  /** A reusable default view of {@link texture}. */
  readonly view: GPUTextureView;
  readonly width: number;
  readonly height: number;
  /** @internal The pass used to resolve into {@link texture}. */
  readonly resolvePass: ReturnType<typeof createCameraPassthroughPipeline>;
}

/**
 * Creates a {@link CameraTextureResolver} with an owned `rgba8unorm` texture of the given size.
 *
 * @group WebGPU
 */
export function createCameraTextureResolver(
  device: GPUDevice,
  size: { width: number; height: number },
): CameraTextureResolver {
  const texture = device.createTexture({
    label: 'fishjam-resolved-camera',
    format: 'rgba8unorm',
    size: [size.width, size.height],
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  return {
    texture,
    view: texture.createView(),
    width: size.width,
    height: size.height,
    resolvePass: createCameraPassthroughPipeline(device, { outputFormat: 'rgba8unorm' }),
  };
}

/**
 * Encodes one pass resolving the live camera texture into `resolver.texture`, aspect-filled to
 * the resolver's size (platform YUV decode included). Worklet-safe; call it inside your render
 * callback before the passes that sample `resolver.texture`.
 *
 * @group WebGPU
 */
export function resolveCameraTexture(
  device: GPUDevice,
  resolver: CameraTextureResolver,
  cameraTexture: GPUExternalTexture,
  cameraWidth: number,
  cameraHeight: number,
  commandEncoder: GPUCommandEncoder,
): void {
  'worklet';
  const crop = computeAspectFillCrop(cameraWidth, cameraHeight, resolver.width / resolver.height);
  encodeCameraPassthrough(device, resolver.resolvePass, cameraTexture, resolver.view, commandEncoder, crop);
}
