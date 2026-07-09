import { Platform } from 'react-native';
import { GPUShaderStage } from 'react-native-webgpu';
import tgpu, { type TgpuFn } from 'typegpu';
import * as d from 'typegpu/data';

// The camera arrives as a `texture_external`, which TypeGPU 0.11 cannot resolve inside a TGSL
// function (its type only resolves as a declaration, not as a sampled value in codegen). So
// `sampleCamera` is authored as a WGSL-bodied `tgpu.fn`: it is a first-class TypeGPU function that
// TGSL shaders can call, but its body is WGSL and it references the external texture + sampler by
// name — those bindings are declared separately by {@link CameraShaderBindings.bindingDeclarations}
// (also WGSL, for the same reason). This is the one part of the shader that is not authored in TGSL.
//
// On Android, the camera arrives as an opaque YCbCr AHardwareBuffer and Dawn's Vulkan path forces
// an identity sampler conversion, so sampling the external texture returns RAW [Y, Cb, Cr] — the
// BT.709 limited-range decode below must run in-shader. iOS (NV12 IOSurface) samples as
// ready-to-use RGB.
const SAMPLE_CAMERA_ANDROID = /* wgsl */ `(uv: vec2f) -> vec4f {
  let rawSample = textureSampleBaseClampToEdge(fishjamCameraTexture, fishjamCameraSampler, uv);
  let luma = rawSample.r - 0.0627451;
  let chromaBlue = rawSample.g - 0.5;
  let chromaRed = rawSample.b - 0.5;
  let rgb = vec3f(
    1.164384 * luma + 1.792741 * chromaRed,
    1.164384 * luma - 0.213249 * chromaBlue - 0.532909 * chromaRed,
    1.164384 * luma + 2.112402 * chromaBlue,
  );
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), 1.0);
}`;

const SAMPLE_CAMERA_IOS = /* wgsl */ `(uv: vec2f) -> vec4f {
  return textureSampleBaseClampToEdge(fishjamCameraTexture, fishjamCameraSampler, uv);
}`;

/**
 * Samples the live camera and returns upright RGB on both platforms (the Android in-shader BT.709
 * YUV decode is included automatically). A TypeGPU function you can call from your own TGSL
 * fragment shaders. It reads the camera texture + sampler declared by
 * {@link CameraShaderBindings.bindingDeclarations}, which you must prepend to the resolved shader.
 *
 * @group WebGPU
 */
export const sampleCamera: TgpuFn<(uv: d.Vec2f) => d.Vec4f> = tgpu
  .fn(
    [d.vec2f],
    d.vec4f,
  )(Platform.OS === 'android' ? SAMPLE_CAMERA_ANDROID : SAMPLE_CAMERA_IOS)
  .$name('sampleCamera');

/** Options for {@link createCameraShaderBindings}. */
export interface CreateCameraShaderBindingsOptions {
  /** Bind group index the camera texture + sampler are declared at. Defaults to `0`. */
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
   * The camera sampler as a TypeGPU function — call `sampleCamera(uv)` from your TGSL fragment
   * shader. Same value as the exported {@link sampleCamera}.
   */
  readonly sampleCamera: typeof sampleCamera;
  /**
   * WGSL declaring the camera `texture_external` and `sampler` at {@link bindGroupIndex}. TypeGPU
   * cannot emit an external-texture binding, so prepend this to the WGSL your shader resolves to.
   */
  readonly bindingDeclarations: string;
  /** Layout of the camera bind group; place it at {@link bindGroupIndex} in your pipeline layout. */
  readonly bindGroupLayout: GPUBindGroupLayout;
  /** The linear-filtering sampler bound at binding 1. */
  readonly sampler: GPUSampler;
  /** The group index the bindings are declared at. */
  readonly bindGroupIndex: number;
}

function buildBindingDeclarations(bindGroupIndex: number): string {
  return /* wgsl */ `@group(${bindGroupIndex}) @binding(0) var fishjamCameraTexture: texture_external;
@group(${bindGroupIndex}) @binding(1) var fishjamCameraSampler: sampler;
`;
}

/**
 * Builds the camera-sampling bindings against the device your pipelines use. Pass the result to
 * the source hook's `cameraShaderBindings` option and the render context delivers a ready-made
 * `cameraBindGroup` every frame — set it at {@link CameraShaderBindings.bindGroupIndex} and call
 * `sampleCamera(uv)` in your fragment shader.
 *
 * ```ts
 * const cam = createCameraShaderBindings(device);
 * const fragment = tgpu.fragmentFn({ in: { uv: d.location(0, d.vec2f) }, out: d.vec4f })((input) => {
 *   return cam.sampleCamera(input.uv);
 * });
 * const wgsl = cam.bindingDeclarations + tgpu.resolve({ externals: { fragment } });
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
    sampleCamera,
    bindingDeclarations: buildBindingDeclarations(bindGroupIndex),
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
