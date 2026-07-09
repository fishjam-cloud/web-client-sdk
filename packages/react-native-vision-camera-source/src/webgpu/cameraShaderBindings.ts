import { Platform } from 'react-native';
import { GPUShaderStage } from 'react-native-webgpu';

// On Android, the camera arrives as an opaque YCbCr AHardwareBuffer and Dawn's Vulkan path forces
// an identity sampler conversion, so sampling the external texture returns RAW [Y, Cb, Cr] — the
// BT.709 limited-range decode below must run in-shader. iOS (NV12 IOSurface) samples as
// ready-to-use RGB.
const SAMPLE_CAMERA_BODY_ANDROID = /* wgsl */ `
  let rawSample = textureSampleBaseClampToEdge(fishjamCameraTexture, fishjamCameraSampler, uv);
  let luma = rawSample.r - 0.0627451;
  let chromaBlue = rawSample.g - 0.5;
  let chromaRed = rawSample.b - 0.5;
  let rgb = vec3f(
    1.164384 * luma + 1.792741 * chromaRed,
    1.164384 * luma - 0.213249 * chromaBlue - 0.532909 * chromaRed,
    1.164384 * luma + 2.112402 * chromaBlue,
  );
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), 1.0);`;

const SAMPLE_CAMERA_BODY_IOS = /* wgsl */ `
  return textureSampleBaseClampToEdge(fishjamCameraTexture, fishjamCameraSampler, uv);`;

function buildCameraShaderCode(bindGroupIndex: number): string {
  const body = Platform.OS === 'android' ? SAMPLE_CAMERA_BODY_ANDROID : SAMPLE_CAMERA_BODY_IOS;
  return /* wgsl */ `
@group(${bindGroupIndex}) @binding(0) var fishjamCameraTexture: texture_external;
@group(${bindGroupIndex}) @binding(1) var fishjamCameraSampler: sampler;

fn sampleCamera(uv: vec2f) -> vec4f {${body}
}
`;
}

/** Options for {@link createCameraShaderBindings}. */
export interface CreateCameraShaderBindingsOptions {
  /** Bind group index the camera bindings are declared at in {@link CameraShaderBindings.shaderCode}. Defaults to `0`. */
  bindGroupIndex?: number;
}

/**
 * Everything a fragment shader needs to sample the live camera. Build once at setup with
 * {@link createCameraShaderBindings}; the fields are safe to capture into the frame worklet.
 *
 * @group WebGPU
 */
export interface CameraShaderBindings {
  /**
   * WGSL to prepend to your fragment shader. It declares the camera texture + sampler at
   * {@link bindGroupIndex} and defines `sampleCamera(uv: vec2f) -> vec4f`, which returns upright
   * RGB on both platforms (the Android in-shader YUV decode is included automatically).
   */
  readonly shaderCode: string;
  /** Layout of the camera bind group; place it at {@link bindGroupIndex} in your pipeline layout. */
  readonly bindGroupLayout: GPUBindGroupLayout;
  /** The linear-filtering sampler bound at binding 1. */
  readonly sampler: GPUSampler;
  /** The group index the bindings are declared at. */
  readonly bindGroupIndex: number;
}

/**
 * Builds the camera-sampling shader bindings against the device your pipelines use. Pass the
 * result to the source hook's `cameraShaderBindings` option and the render context delivers a
 * ready-made `cameraBindGroup` every frame — set it at {@link CameraShaderBindings.bindGroupIndex}
 * and call `sampleCamera(uv)` in your fragment shader.
 *
 * ```ts
 * const cameraBindings = createCameraShaderBindings(device);
 * const module = device.createShaderModule({ code: cameraBindings.shaderCode + MY_FRAGMENT_WGSL });
 * ```
 *
 * @group WebGPU
 */
export function createCameraShaderBindings(
  device: GPUDevice,
  options: CreateCameraShaderBindingsOptions = {},
): CameraShaderBindings {
  const bindGroupIndex = options.bindGroupIndex ?? 0;
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'fishjam-camera-shader-bindings',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, externalTexture: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ],
  });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  return {
    shaderCode: buildCameraShaderCode(bindGroupIndex),
    bindGroupLayout,
    sampler,
    bindGroupIndex,
  };
}

/**
 * Builds the per-frame bind group for the live camera texture. The source hook already does this
 * for you when you pass `cameraShaderBindings` in its options (see the render context's
 * `cameraBindGroup`); call it yourself only for advanced multi-layout setups. Worklet-safe.
 *
 * A camera texture expires when the frame ends, so a bind group referencing it must be rebuilt
 * every frame — never cache the result.
 *
 * @group WebGPU
 */
export function createCameraBindGroup(
  device: GPUDevice,
  cameraShaderBindings: CameraShaderBindings,
  cameraTexture: GPUExternalTexture,
): GPUBindGroup {
  'worklet';
  return device.createBindGroup({
    label: 'fishjam-camera-frame',
    layout: cameraShaderBindings.bindGroupLayout,
    entries: [
      { binding: 0, resource: cameraTexture },
      { binding: 1, resource: cameraShaderBindings.sampler },
    ],
  });
}
