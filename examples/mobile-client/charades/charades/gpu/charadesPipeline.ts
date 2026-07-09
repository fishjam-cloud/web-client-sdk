/**
 * CHARADES CAMERA-PASSTHROUGH PIPELINE BUILDER (runs ONCE on the JS thread)
 * ============================================================================
 *
 * A stripped-down descendant of the selfie-segmentation composite: it keeps ONLY
 * the camera half. There is no CNN, no mask, no gradient background, no
 * preprocess, and no upsample — just a single full-screen-triangle RENDER
 * pipeline whose fragment shader samples the live camera external texture and
 * writes it straight into the IOSurface output.
 *
 * As with the segmentation bundle, setup happens on the JS thread and everything
 * is flattened to raw react-native-webgpu NativeObjects + plain values so the
 * VisionCamera frame-processor worklet can replay the draw without any tgpu
 * object crossing the worklet boundary. Per frame the worklet rebuilds the
 * camera-external-texture bind group and writes the crop uniforms; everything
 * else is baked here.
 */
import { Platform } from 'react-native';
import tgpu, { common, d, std } from 'typegpu';
import type { TgpuRoot } from 'typegpu';

import { FrameCropParams, initialFrameCropParams } from './frame';
import { BrushParams, initialBrushParams } from './brushParams';
import { recordRenderDispatch } from './nativeRecording';

// The composite render target's format MUST match the custom-track output
// surface texture (see the vision-camera-source package / useCharadesCameraEffect
// OUTPUT_SURFACE_FORMAT): iOS imports BGRA8 IOSurfaces, Android imports RGBA8
// AHardwareBuffers.
const OUTPUT_SURFACE_FORMAT: GPUTextureFormat =
  Platform.OS === 'android' ? 'rgba8unorm' : 'bgra8unorm';

// On Android, importExternalTexture imports the camera as an opaque YCbCr
// AHardwareBuffer and Dawn's Vulkan path forces an identity (RGB_IDENTITY)
// sampler conversion, so textureSampleBaseClampToEdge returns RAW [Y, Cb, Cr] —
// we must apply the YUV->RGB matrix in-shader. iOS (NV12 IOSurface) returns
// ready-to-use RGB, so no decode is needed. (See the react-native-webgpu README
// "Android note" + its VisionCamera example CAMERA_PRELUDE.)
const CAMERA_IS_YUV = Platform.OS === 'android';

// Selfie mirror. On iOS the Dawn-imported front-camera frame arrives
// UN-mirrored, so the composite flips X to give the mirror look. On Android
// the frame arrives already mirror-look (front sensor convention; VisionCamera
// 'auto' does not counter-mirror data outputs), so the composite must NOT
// flip — flipping there would undo the mirror. Build-time constant, same
// pattern as CAMERA_IS_YUV. The hand-cursor mapping in
// useCharadesCameraEffect mirrors this choice (MIRRORED_IN_COMPOSITE there).
const MIRROR_IN_COMPOSITE = Platform.OS === 'ios';

// BT.709 limited-range YUV->RGB decode of a raw [Y, Cb, Cr] external sample,
// matching the library's reference CAMERA_PRELUDE. Used only on Android (the
// build-time CAMERA_IS_YUV ternary at the call site keeps it out of the iOS
// shader graph entirely).
const decodeCameraYuv = (c: d.v4f): d.v3f => {
  'use gpu';
  const luma = c.r - 0.0627451;
  const cb = c.g - 0.5;
  const cr = c.b - 0.5;
  const rgb = d.vec3f(
    1.164384 * luma + 1.792741 * cr,
    1.164384 * luma - 0.213249 * cb - 0.532909 * cr,
    1.164384 * luma + 2.112402 * cb,
  );
  return std.clamp(rgb, d.vec3f(0), d.vec3f(1));
};

// The per-frame camera external-texture group. Bound in the worklet from the
// live external texture (which only exists there, only until the next submit).
const compositeFrameLayout = tgpu.bindGroupLayout({
  frame: { externalTexture: d.textureExternal() },
});

// The persistent GPU "strokes" overlay, sampled by the composite on top of the
// camera. It is our OWN rgba8unorm texture (created at setup, accumulated across
// frames), NOT the platform surface — so rgba8unorm on both iOS and Android.
const compositeStrokesLayout = tgpu.bindGroupLayout({
  strokes: { texture: d.texture2d() },
});

// ---------------------------------------------------------------------------
// The fully-flattened, worklet-serializable result of setup.
// ---------------------------------------------------------------------------
export interface CharadesBundle {
  /** Dimensions of the IOSurface output (composite target). */
  readonly outputWidth: number;
  readonly outputHeight: number;
  /** The camera-passthrough composite render pipeline (raw native). */
  readonly pipeline: GPURenderPipeline;
  /**
   * Static composite group(s): the auto-bound uniform + sampler catch-all AND the
   * strokes-overlay sample group. (All non-per-frame; the camera external texture
   * is the only per-frame group.)
   */
  readonly staticGroups: { index: number; bindGroup: GPUBindGroup }[];
  /** Group index where the worklet binds the camera external-texture group. */
  readonly frameGroupIndex: number;
  /** Bind-group layout for the per-frame camera external-texture group. */
  readonly frameLayout: GPUBindGroupLayout;
  /** Uniform buffer for the composite FrameCropParams (crop/orientation). */
  readonly compositeParamsBuffer: GPUBuffer;

  // --- Persistent strokes overlay (drawn BEFORE the composite each frame). ---
  /** Raw RENDER_ATTACHMENT view of the persistent strokes texture (brush target). */
  readonly strokesAttachmentView: GPUTextureView;
  /** The fully-static brush render pipeline that paints into the strokes texture. */
  readonly brushPipeline: GPURenderPipeline;
  /** The brush pipeline's static groups (its auto-bound BrushParams uniform). */
  readonly brushStaticGroups: { index: number; bindGroup: GPUBindGroup }[];
  /** Uniform buffer for the per-frame BrushParams (cursor/segment/color). */
  readonly brushParamsBuffer: GPUBuffer;
  /**
   * Uniform buffer for the live cursor-ring indicator drawn by the composite
   * (4 f32: x, y in output uv, radius, active). The ring is a non-persistent
   * overlay — unlike brush strokes it never accumulates.
   */
  readonly cursorIndicatorBuffer: GPUBuffer;
}

/**
 * Builds the camera-passthrough composite pipeline on the JS thread and flattens
 * it to raw natives. Call once, after the GPUDevice is ready. No model load.
 */
export function buildCharadesBundle(
  root: TgpuRoot,
  outputWidth: number,
  outputHeight: number,
): CharadesBundle {
  const compositeUniform = root.createUniform(
    FrameCropParams,
    initialFrameCropParams,
  );
  // Live cursor-ring indicator (position in OUTPUT uv, radius in v-units,
  // strength 0|1, aspect = outputWidth/outputHeight so the ring stays round
  // on non-square outputs). Drawn by the composite every frame — never
  // accumulated into the strokes. NOTE: the field is named `strength`, not
  // `active` — `active` is a WGSL reserved keyword and tgpu rejects it.
  const CursorIndicatorParams = d.struct({
    position: d.vec2f,
    radius: d.f32,
    strength: d.f32,
    aspect: d.f32,
  });
  const cursorIndicatorUniform = root.createUniform(CursorIndicatorParams, {
    position: d.vec2f(0.5, 0.5),
    radius: 0.02,
    strength: 0,
    aspect: 1,
  });
  const compositeSampler = root.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const compositeFragment = tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })(({ uv }) => {
    'use gpu';
    // Identical camera-sampling math to the segmentation composite fragment,
    // written with the `std` operator functions (the exact form tgpu's babel
    // plugin lowers `+`/`-`/`*`/`/` to) so it type-checks under plain tsc:
    //   cropUv     = vec2f(1 - uv.x, uv.y)
    //   sourcePixel = cropOrigin + cropUv * cropSize
    //   sourceUv    = sourcePixel / sourceSize
    //   cameraUv    = uvTransform * (sourceUv - 0.5) + 0.5
    const cropUv = MIRROR_IN_COMPOSITE ? d.vec2f(1 - uv.x, uv.y) : uv;
    const sourcePixel = std.add(
      compositeUniform.$.cropOrigin,
      std.mul(cropUv, compositeUniform.$.cropSize),
    );
    const sourceUv = std.div(
      sourcePixel,
      d.vec2f(compositeUniform.$.sourceSize),
    );
    const cameraUv = std.add(
      std.mul(compositeUniform.$.uvTransform, std.sub(sourceUv, 0.5)),
      0.5,
    );
    const cameraColor = std.textureSampleBaseClampToEdge(
      compositeFrameLayout.$.frame,
      compositeSampler.$,
      cameraUv,
    );
    // Android external sample is raw YCbCr; decode to RGB. iOS already yields
    // RGB. Build-time select on the constant.
    const cameraRgb = CAMERA_IS_YUV ? decodeCameraYuv(cameraColor) : cameraColor.rgb;
    // Composite the persistent strokes overlay ON TOP of the camera. The strokes
    // texture stores PREMULTIPLIED color (rgb = color*alpha, a = alpha), sampled
    // in OUTPUT uv (no camera flip — strokes live in output space). Premultiplied
    // "over": out = camera*(1 - a) + premulColor.
    const s = std.textureSample(compositeStrokesLayout.$.strokes, compositeSampler.$, uv);
    const composed = std.add(std.mul(cameraRgb, 1 - s.w), s.xyz);
    // Live cursor ring on top: a soft white ring around the cursor position
    // while a cursor is active (aiming aid — hover shows the ring, pinching
    // draws). Distance measured in v-units (x scaled by the output aspect) so
    // the ring stays round on non-square outputs.
    const cursorDelta = std.sub(uv, cursorIndicatorUniform.$.position);
    const cursorDistance = std.length(
      d.vec2f(
        cursorDelta.x * cursorIndicatorUniform.$.aspect,
        cursorDelta.y,
      ),
    );
    const ringRadius = cursorIndicatorUniform.$.radius;
    const ring =
      cursorIndicatorUniform.$.strength *
      (std.smoothstep(ringRadius * 0.55, ringRadius * 0.8, cursorDistance) -
        std.smoothstep(ringRadius * 0.95, ringRadius * 1.2, cursorDistance));
    return d.vec4f(std.mix(composed, d.vec3f(1, 1, 1), ring * 0.85), 1);
  });

  const compositePipelineTgpu = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: compositeFragment,
    // The custom-track output surface is imported as bgra8unorm on iOS and
    // rgba8unorm on Android (see OUTPUT_SURFACE_FORMAT); the composite color
    // target MUST match the surface texture's format or Dawn-Vulkan renders
    // wrong/black.
    targets: { format: OUTPUT_SURFACE_FORMAT },
  });

  // -------------------------------------------------------------------------
  // Persistent strokes overlay: a setup-created rgba8unorm texture, both a
  // brush RENDER target and a composite SAMPLED source. It accumulates across
  // frames (the worklet uses loadOp:'load' and MAX blend), so it must be OUR own
  // texture (never the per-frame surface). Give it render + sampled usage; the
  // raw unwrapped view is used directly as the worklet's brush attachment.
  // -------------------------------------------------------------------------
  const strokes = root
    .createTexture({
      size: [outputWidth, outputHeight],
      format: 'rgba8unorm',
    })
    .$usage('render', 'sampled');
  const strokesSampleView = strokes.createView();
  const strokesAttachmentView = root.unwrap(strokes.createView());
  const strokesGroup = root.createBindGroup(compositeStrokesLayout, {
    strokes: strokesSampleView,
  });

  // Brush render pipeline: a full-screen pass whose fragment paints a soft round
  // capsule (segment SDF prev->cur) in PREMULTIPLIED color, MAX-blended into the
  // strokes texture so repeated paint at one spot is idempotent and distant
  // pixels (coverage ~0) leave prior strokes untouched under loadOp:'load'.
  const brushUniform = root.createUniform(BrushParams, initialBrushParams);
  const brushFragment = tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })(({ uv }) => {
    'use gpu';
    // Distance from this pixel to the segment prev->cur, measured in v-units
    // (x scaled by the output aspect so the brush stays ROUND on non-square
    // outputs; radius is a fraction of the output height).
    // (Scalar math uses `*`/`-`/`/` — the babel plugin lowers scalar operators
    // and the operands are plain `number` under tsc; vec math uses `std.*`.)
    const cur = brushUniform.$.cur;
    const prev = brushUniform.$.prev;
    const aspect = brushUniform.$.aspect;
    const paUv = std.sub(uv, prev);
    const baUv = std.sub(cur, prev);
    const pa = d.vec2f(paUv.x * aspect, paUv.y);
    const ba = d.vec2f(baUv.x * aspect, baUv.y);
    const h = std.clamp(
      std.dot(pa, ba) / std.max(std.dot(ba, ba), 1e-6),
      0,
      1,
    );
    const dist = std.length(std.sub(pa, std.mul(ba, h)));
    const radius = brushUniform.$.radius;
    // Soft edge; `draw` is 0 (no-op) or 1 (painting).
    const cov = brushUniform.$.draw * (1 - std.smoothstep(radius * 0.6, radius, dist));
    // Premultiplied output: rgb = color*cov, a = cov.
    return d.vec4f(std.mul(brushUniform.$.color, cov), cov);
  });

  const brushPipelineTgpu = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: brushFragment,
    // MAX blend on premultiplied color: repeated paint at one spot is idempotent,
    // and because distant coverage is ~0 the pass accumulates prior strokes under
    // loadOp:'load'. Our own rgba8unorm strokes texture (both platforms).
    targets: {
      format: 'rgba8unorm',
      blend: {
        color: { operation: 'max', srcFactor: 'one', dstFactor: 'one' },
        alpha: { operation: 'max', srcFactor: 'one', dstFactor: 'one' },
      },
    },
  });

  // The brush pass is FULLY STATIC (its only resource is the auto-bound
  // BrushParams uniform) — no per-frame external texture — so pass NO frameLayout;
  // recordRenderDispatch expects the draw to succeed and returns frameGroupIndex -1.
  const brush = recordRenderDispatch(root, brushPipelineTgpu, /* staticGroups */ []);

  // Flatten the composite render bind groups by recording the render apply. The
  // composite now has ONE explicit static group (the strokes sample group) plus
  // tgpu's auto-bound uniform/sampler catch-all; the per-frame external-texture
  // group is bound in the worklet and surfaces as the single missing group index.
  const composite = recordRenderDispatch(
    root,
    compositePipelineTgpu,
    /* staticGroups */ [strokesGroup],
    /* frameLayout */ compositeFrameLayout,
  );

  return {
    outputWidth,
    outputHeight,
    pipeline: composite.pipeline,
    staticGroups: composite.staticGroups,
    frameGroupIndex: composite.frameGroupIndex,
    frameLayout: root.unwrap(compositeFrameLayout),
    compositeParamsBuffer: root.unwrap(compositeUniform.buffer),
    strokesAttachmentView,
    brushPipeline: brush.pipeline,
    brushStaticGroups: brush.staticGroups,
    brushParamsBuffer: root.unwrap(brushUniform.buffer),
    cursorIndicatorBuffer: root.unwrap(cursorIndicatorUniform.buffer),
  };
}
