/// <reference types="@webgpu/types" />
/**
 * WebGPU tier of the VisionCamera → Fishjam adapter — render your own content into the published
 * video. Requires `react-native-webgpu` (an optional peer of this package; only this entry point
 * loads it).
 *
 * - {@link useVisionCameraWebGpuSource} — the source hook: camera in, your WebGPU passes,
 *   published video out.
 * - {@link createCameraShaderBindings} — sample the live camera from your own shaders via
 *   `sampleCamera(uv)`, with the platform's YUV decode handled for you.
 * - {@link createCameraPassthroughPipeline} / {@link encodeCameraPassthrough} — a ready-made
 *   camera→output pass to publish the camera with zero WGSL, or to build overlays on.
 * - {@link createCameraTextureResolver} — opt-in plain-texture camera for pipelines that can't
 *   sample `texture_external`.
 *
 * @packageDocumentation
 */

export {
  type CameraPassthroughPipeline,
  type CameraPassthroughPipelineOptions,
  createCameraPassthroughPipeline,
  encodeCameraPassthrough,
} from './webgpu/cameraPassthroughPipeline';
export {
  type CameraShaderBindings,
  createCameraBindGroup,
  createCameraShaderBindings,
  type CreateCameraShaderBindingsOptions,
  sampleCamera,
} from './webgpu/cameraShaderBindings';
export {
  type CameraTextureResolver,
  createCameraTextureResolver,
  resolveCameraTexture,
} from './webgpu/cameraTextureResolver';
export {
  computeAspectFillCrop,
  computeSquareCrop,
  type FrameCrop,
  FrameCropParams,
  packFrameCropParams,
} from './webgpu/cropUtilities';
export type { WebGpuFrameRenderContext, WebGpuFrameRenderFunction } from './webgpu/frameRenderContext';
export {
  assertWebGpuDeviceSupportsCameraImport,
  getOutputSurfaceFormat,
  getRequiredWebGpuCameraFeatures,
} from './webgpu/requiredFeatures';
export { useCameraWebGpuDevice, type UseCameraWebGpuDeviceResult } from './webgpu/useCameraWebGpuDevice';
export {
  useVisionCameraWebGpuSource,
  type UseVisionCameraWebGpuSourceOptions,
  type UseVisionCameraWebGpuSourceResult,
} from './webgpu/useVisionCameraWebGpuSource';
