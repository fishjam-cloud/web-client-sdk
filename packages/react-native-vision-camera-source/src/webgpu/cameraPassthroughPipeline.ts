import { GPUBufferUsage, GPUShaderStage } from 'react-native-webgpu';

import { type CameraShaderBindings, createCameraBindGroup, createCameraShaderBindings } from './cameraShaderBindings';
import { type FrameCrop, packFrameCropParams } from './cropUtilities';
import { getOutputSurfaceFormat } from './requiredFeatures';

const CAMERA_BIND_GROUP_INDEX = 0;
const CROP_BIND_GROUP_INDEX = 1;

const FRAME_CROP_BUFFER_BYTES = 40;

// One oversized triangle covering the viewport; uv spans [0,1] top-left origin over the visible
// area. The fragment applies the FrameCropParams crop + orientation transform (same math as the
// charades composite) and samples the camera via the injected sampleCamera().
function buildPassthroughShaderCode(cameraShaderCode: string, mirror: boolean): string {
  const cropUvExpression = mirror ? 'vec2f(1.0 - screenUv.x, screenUv.y)' : 'screenUv';
  return /* wgsl */ `${cameraShaderCode}
struct FrameCropParams {
  sourceSize: vec2u,
  cropOrigin: vec2f,
  cropSize: vec2f,
  uvTransform: mat2x2f,
}

@group(${CROP_BIND_GROUP_INDEX}) @binding(0) var<uniform> cropParams: FrameCropParams;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let position = positions[vertexIndex];
  var output: VertexOutput;
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = vec2f((position.x + 1.0) * 0.5, 1.0 - (position.y + 1.0) * 0.5);
  return output;
}

@fragment
fn fragmentMain(@location(0) screenUv: vec2f) -> @location(0) vec4f {
  let cropUv = ${cropUvExpression};
  let sourcePixel = cropParams.cropOrigin + cropUv * cropParams.cropSize;
  let sourceUv = sourcePixel / vec2f(cropParams.sourceSize);
  let cameraUv = cropParams.uvTransform * (sourceUv - vec2f(0.5)) + vec2f(0.5);
  return sampleCamera(cameraUv);
}
`;
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
  /** The camera shader bindings the pipeline samples through (group 0). */
  readonly cameraShaderBindings: CameraShaderBindings;
  /** Uniform buffer holding the packed FrameCropParams; written by {@link encodeCameraPassthrough}. */
  readonly cropParamsBuffer: GPUBuffer;
  /** Static bind group with the crop uniform (group 1). */
  readonly cropBindGroup: GPUBindGroup;
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
    code: buildPassthroughShaderCode(cameraShaderBindings.shaderCode, options.mirror ?? false),
  });
  const pipeline = device.createRenderPipeline({
    label: 'fishjam-camera-passthrough',
    layout: device.createPipelineLayout({
      bindGroupLayouts: [cameraShaderBindings.bindGroupLayout, cropBindGroupLayout],
    }),
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
  pass.setBindGroup(CAMERA_BIND_GROUP_INDEX, cameraBindGroup);
  pass.setBindGroup(CROP_BIND_GROUP_INDEX, passthrough.cropBindGroup);
  pass.draw(3);
  pass.end();
}
