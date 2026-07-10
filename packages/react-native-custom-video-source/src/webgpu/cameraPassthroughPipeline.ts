import { GPUBufferUsage, GPUShaderStage } from 'react-native-webgpu';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { add, div, mul, sub } from 'typegpu/std';

import {
  type CameraShaderBindings,
  createCameraBindGroup,
  createCameraShaderBindings,
  sampleCamera,
} from './cameraShaderBindings';
import { type FrameCrop, FrameCropParams, packFrameCropParams } from './cropUtilities';
import { getOutputSurfaceFormat } from './requiredFeatures';

// Crop is a plain uniform, so it is authored in TGSL and TypeGPU assigns it @group(0). The camera
// is a `texture_external`, which TypeGPU cannot resolve in a shader, so its bindings are raw WGSL
// and go at @group(1) (see cameraShaderBindings). This is a group swap from the pre-TGSL shader
// (which had camera at 0, crop at 1) but is otherwise identical.
const CROP_BIND_GROUP_INDEX = 0;
const CAMERA_BIND_GROUP_INDEX = 1;

const FRAME_CROP_BUFFER_BYTES = d.sizeOf(FrameCropParams);

// TypeGPU bind group layout for the crop uniform — the source of truth for the WGSL declaration
// and for the fragment's typed access to `cropParams`.
const cropLayout = tgpu.bindGroupLayout({ cropParams: { uniform: FrameCropParams } });

// One oversized triangle covering the viewport; uv spans [0,1] top-left origin over the visible
// area.
const vertexMain = tgpu
  .vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex },
    out: { position: d.builtin.position, uv: d.location(0, d.vec2f) },
  })((input) => {
    const positions = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];
    const position = positions[input.vertexIndex];
    return {
      position: d.vec4f(position.x, position.y, 0, 1),
      uv: d.vec2f((position.x + 1) * 0.5, 1 - (position.y + 1) * 0.5),
    };
  })
  .$name('vertexMain');

// The fragment applies the FrameCropParams crop + orientation transform and samples the camera via
// sampleCamera(). Mirroring is folded into a build-time sign/offset on uv.x (mirror → 1 - x) so the
// shader stays branch-free.
function makeFragmentMain(mirror: boolean) {
  const mirrorSign = mirror ? -1 : 1;
  const mirrorOffset = mirror ? 1 : 0;
  return tgpu
    .fragmentFn({ in: { screenUv: d.location(0, d.vec2f) }, out: d.vec4f })((input) => {
      // cropUv = (mirrorSign * screenUv.x + mirrorOffset, screenUv.y), expressed with vector ops
      // so mirrorSign/mirrorOffset fold to literals and the WGSL stays branch-free.
      const cropUv = add(mul(input.screenUv, d.vec2f(mirrorSign, 1)), d.vec2f(mirrorOffset, 0));
      const cp = cropLayout.$.cropParams;
      const sourcePixel = add(cp.cropOrigin, mul(cropUv, cp.cropSize));
      const sourceUv = div(sourcePixel, d.vec2f(cp.sourceSize));
      const cameraUv = add(mul(cp.uvTransform, sub(sourceUv, d.vec2f(0.5))), d.vec2f(0.5));
      return sampleCamera(cameraUv);
    })
    .$name('fragmentMain');
}

/** Options for {@link createCameraPassthroughPipeline}. */
export interface CameraPassthroughPipelineOptions {
  /** Render-target format. Defaults to {@link getOutputSurfaceFormat} (the Fishjam output surface). */
  outputFormat?: GPUTextureFormat;
  /** Mirror the camera horizontally (the usual selfie self-view convention). Defaults to `false`. */
  mirror?: boolean;
}

/**
 * A ready-made full-screen camera→target render pipeline. Build once at setup with
 * {@link createCameraPassthroughPipeline}; every field is safe to capture into the frame worklet.
 *
 * @group WebGPU
 */
export interface CameraPassthroughPipeline {
  readonly pipeline: GPURenderPipeline;
  /** The camera shader bindings the pipeline samples through. */
  readonly cameraShaderBindings: CameraShaderBindings;
  /** Uniform buffer holding the packed FrameCropParams; written by {@link encodeCameraPassthrough}. */
  readonly cropParamsBuffer: GPUBuffer;
  /** Static bind group with the crop uniform. */
  readonly cropBindGroup: GPUBindGroup;
}

/**
 * Resolves the passthrough shader to WGSL: the raw camera-texture declarations (which TypeGPU
 * cannot emit) followed by the TGSL-authored vertex + fragment functions, `sampleCamera`, and the
 * `FrameCropParams` struct + crop uniform.
 */
function buildPassthroughShaderCode(cameraShaderBindings: CameraShaderBindings, mirror: boolean): string {
  const resolved = tgpu.resolve({
    externals: { vertexMain, fragmentMain: makeFragmentMain(mirror) },
    names: 'strict',
  });
  return `${cameraShaderBindings.bindingDeclarations}\n${resolved}`;
}

/**
 * Builds the full-screen camera passthrough pipeline: crop/orientation via {@link FrameCrop},
 * platform-correct camera sampling, one triangle. Use it to publish the camera through the WebGPU
 * tier with zero WGSL of your own, or as the base pass under your overlay passes.
 *
 * @group WebGPU
 */
export function createCameraPassthroughPipeline(
  device: GPUDevice,
  options: CameraPassthroughPipelineOptions = {},
): CameraPassthroughPipeline {
  const outputFormat = options.outputFormat ?? getOutputSurfaceFormat();
  const cameraShaderBindings = createCameraShaderBindings(device, { bindGroupIndex: CAMERA_BIND_GROUP_INDEX });

  const cropBindGroupLayout = device.createBindGroupLayout({
    label: 'fishjam-camera-passthrough-crop',
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
  const cropParamsBuffer = device.createBuffer({
    label: 'fishjam-camera-passthrough-crop-params',
    size: FRAME_CROP_BUFFER_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const cropBindGroup = device.createBindGroup({
    layout: cropBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: cropParamsBuffer } }],
  });

  const shaderModule = device.createShaderModule({
    label: 'fishjam-camera-passthrough',
    code: buildPassthroughShaderCode(cameraShaderBindings, options.mirror ?? false),
  });
  const bindGroupLayouts: GPUBindGroupLayout[] = [];
  bindGroupLayouts[CROP_BIND_GROUP_INDEX] = cropBindGroupLayout;
  bindGroupLayouts[CAMERA_BIND_GROUP_INDEX] = cameraShaderBindings.bindGroupLayout;
  const pipeline = device.createRenderPipeline({
    label: 'fishjam-camera-passthrough',
    layout: device.createPipelineLayout({ bindGroupLayouts }),
    vertex: { module: shaderModule, entryPoint: 'vertexMain' },
    fragment: {
      module: shaderModule,
      entryPoint: 'fragmentMain',
      targets: [{ format: outputFormat }],
    },
    primitive: { topology: 'triangle-list' },
  });

  return { pipeline, cameraShaderBindings, cropParamsBuffer, cropBindGroup };
}

/**
 * Encodes one full-screen pass drawing the camera into `outputView`, cropped per `crop`.
 * Worklet-safe; call it inside your render callback, and encode any overlay passes after it on
 * the same command encoder (with `loadOp: 'load'` so they draw on top).
 *
 * At most one call per pipeline instance per frame: the crop lives in a single uniform buffer
 * written via `queue.writeBuffer`, which lands before the submitted command buffer executes — a
 * second call in the same frame makes both draws use the second crop. Encode to multiple targets
 * with different crops by building one pipeline per target.
 *
 * @group WebGPU
 */
export function encodeCameraPassthrough(
  device: GPUDevice,
  passthrough: CameraPassthroughPipeline,
  cameraTexture: GPUExternalTexture,
  outputView: GPUTextureView,
  commandEncoder: GPUCommandEncoder,
  crop: FrameCrop,
): void {
  'worklet';
  device.queue.writeBuffer(passthrough.cropParamsBuffer, 0, packFrameCropParams(crop));
  const cameraBindGroup = createCameraBindGroup(device, passthrough.cameraShaderBindings, cameraTexture);
  const pass = commandEncoder.beginRenderPass({
    colorAttachments: [{ view: outputView, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
  });
  pass.setPipeline(passthrough.pipeline);
  pass.setBindGroup(CROP_BIND_GROUP_INDEX, passthrough.cropBindGroup);
  pass.setBindGroup(CAMERA_BIND_GROUP_INDEX, cameraBindGroup);
  pass.draw(3);
  pass.end();
}
