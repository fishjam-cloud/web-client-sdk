/**
 * PER-FRAME WORKLET EXECUTOR (runs in the VisionCamera worklet)
 * ============================================================================
 *
 * Replays the pre-recorded native composite draw (from `buildCharadesBundle`)
 * against the live camera external texture + the IOSurface output texture. ONLY
 * raw react-native-webgpu NativeObjects + plain values are touched here — no
 * tgpu objects (they cannot cross the worklet boundary).
 *
 * Per frame:
 *   1. Write the crop/orientation uniforms (composite) + the brush uniform.
 *   2. Brush render pass FIRST: paint the animated cursor segment into the
 *      persistent strokes texture (loadOp 'load' to accumulate, or 'clear' to
 *      wipe on periodic-clear frames). Fully static — no external texture.
 *   3. Build the camera external-texture bind group from the live external
 *      texture + the recorded raw layout.
 *   4. Composite render pass into the IOSurface texture view: sample the camera
 *      through the full-screen triangle and blend the strokes overlay on top.
 *
 * The caller owns begin/endAccess on the IOSurface and the submit; this function
 * only encodes into the supplied `encoder`.
 */
import {
  packFrameCropParams,
  type FrameCrop,
} from '@fishjam-cloud/react-native-vision-camera-source/webgpu';
import { packBrushParams, type BrushInput } from './brushParams';
import type { CharadesBundle } from './charadesPipeline';

/** The live cursor-ring indicator drawn by the composite (never persisted). */
export interface CursorIndicatorInput {
  /** OUTPUT display uv. */
  x: number;
  /** OUTPUT display uv. */
  y: number;
  /** Ring radius in v-units (fraction of the output height). */
  radius: number;
  /** True while a cursor (hand or touch) is present. */
  active: boolean;
  /** Output aspect (width/height) so the ring stays round. */
  aspect: number;
}

/**
 * Encodes the camera-passthrough composite for one camera frame.
 *
 * @param bundle             setup-time native bundle (worklet-captured closure)
 * @param device             the GPUDevice (raw NativeObject)
 * @param cameraExternalTex  the camera frame imported as a texture_external
 * @param outputView         the IOSurface RENDER_ATTACHMENT texture view
 * @param encoder            command encoder (begin/endAccess + submit by caller)
 * @param crop               square crop + orientation for this frame
 * @param brush              this frame's brush cursor/segment (from the HandSource)
 * @param clearStrokes       when true, WIPE the strokes texture before painting
 */
export function encodeCharadesFrame(
  bundle: CharadesBundle,
  device: GPUDevice,
  cameraExternalTex: GPUExternalTexture,
  outputView: GPUTextureView,
  encoder: GPUCommandEncoder,
  crop: FrameCrop,
  brush: BrushInput,
  clearStrokes: boolean,
  cursorIndicator: CursorIndicatorInput,
): void {
  'worklet';

  // --- 1. Per-frame uniforms (composite crop + brush + cursor ring). ---
  device.queue.writeBuffer(
    bundle.compositeParamsBuffer,
    0,
    packFrameCropParams(crop),
  );
  device.queue.writeBuffer(bundle.brushParamsBuffer, 0, packBrushParams(brush));
  // CursorIndicatorParams layout: position vec2f @0, radius f32 @8,
  // strength f32 @12, aspect f32 @16 (struct size 24, tail padded).
  const cursorIndicatorValues = new Float32Array(6);
  cursorIndicatorValues[0] = cursorIndicator.x;
  cursorIndicatorValues[1] = cursorIndicator.y;
  cursorIndicatorValues[2] = cursorIndicator.radius;
  cursorIndicatorValues[3] = cursorIndicator.active ? 1 : 0;
  cursorIndicatorValues[4] = cursorIndicator.aspect;
  device.queue.writeBuffer(
    bundle.cursorIndicatorBuffer,
    0,
    cursorIndicatorValues,
  );

  // --- 2. Brush render pass FIRST: paint into the persistent strokes texture. ---
  // loadOp 'load' accumulates prior strokes; 'clear' wipes on periodic-clear
  // frames. When brush.draw is false the fragment paints nothing, so a 'load'
  // pass is a cheap no-op. Same command encoder, so Dawn inserts the write->read
  // barrier before the composite samples this texture below.
  const brushPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: bundle.strokesAttachmentView,
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: clearStrokes ? 'clear' : 'load',
        storeOp: 'store',
      },
    ],
  });
  brushPass.setPipeline(bundle.brushPipeline);
  for (let g = 0; g < bundle.brushStaticGroups.length; g++) {
    brushPass.setBindGroup(
      bundle.brushStaticGroups[g].index,
      bundle.brushStaticGroups[g].bindGroup,
    );
  }
  brushPass.draw(3);
  brushPass.end();

  // --- 3. Per-frame camera external-texture bind group. ---
  const frameGroup = device.createBindGroup({
    layout: bundle.frameLayout,
    entries: [{ binding: 0, resource: cameraExternalTex }],
  });

  // --- 4. Composite pass: camera passthrough + strokes overlay into the IOSurface. ---
  const renderPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: outputView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });
  renderPass.setPipeline(bundle.pipeline);
  for (let g = 0; g < bundle.staticGroups.length; g++) {
    renderPass.setBindGroup(
      bundle.staticGroups[g].index,
      bundle.staticGroups[g].bindGroup,
    );
  }
  renderPass.setBindGroup(bundle.frameGroupIndex, frameGroup);
  renderPass.draw(3);
  renderPass.end();
}
