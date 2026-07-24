/**
 * Everything your render callback needs for one frame. Handed to the function you pass to
 * `render(...)` inside the source hook's `onFrame` worklet; every field is valid only until that
 * function returns.
 *
 * @group WebGPU
 */
export interface WebGpuFrameRenderContext {
  /** The device in use (the shared device, or your override). */
  device: GPUDevice;
  /** Shortcut for `device.queue`. */
  queue: GPUQueue;
  /**
   * The command encoder for this frame. Encode your render/compute passes into it — the hook
   * submits it (a single submit) and delivers the frame after your callback returns. Do not call
   * `queue.submit` yourself for work targeting {@link outputTexture}.
   */
  commandEncoder: GPUCommandEncoder;
  /**
   * The live camera frame as a `texture_external`, already rotated upright (and mirrored per the
   * camera's mirroring). On Android it samples as raw YCbCr — sample it through
   * `createCameraShaderBindings` (or the ready-made {@link cameraBindGroup}) for
   * platform-correct RGB.
   */
  cameraTexture: GPUExternalTexture;
  /**
   * Ready-made bind group for {@link cameraTexture}, present when the hook's
   * `cameraShaderBindings` option was provided: set it at the bindings' group index and
   * `sampleCamera(uv)` works.
   */
  cameraBindGroup?: GPUBindGroup;
  /** The output texture your passes draw into; its content becomes the published video frame. */
  outputTexture: GPUTexture;
  /**
   * A cached, reusable default `createView()` of {@link outputTexture}. Prefer this over calling
   * `outputTexture.createView()` yourself every frame: `GPUTextureView` has no `destroy()`/`release()`
   * in react-native-webgpu, so a per-frame view accumulates native (malloc) wrappers on the frame
   * runtime until GC — a steady leak in a render loop. The output textures are a small fixed pool, so
   * the hook builds one view per slot and reuses it.
   */
  outputView: GPUTextureView;
  /** Size of {@link outputTexture}, in pixels. */
  outputWidth: number;
  outputHeight: number;
  /**
   * Upright (post-rotation) camera frame size, in pixels — feed it to `computeAspectFillCrop`
   * together with the output aspect.
   */
  cameraWidth: number;
  cameraHeight: number;
  /** Whether the camera feed is mirrored (front cameras usually are). */
  cameraIsMirrored: boolean;
}

/**
 * The `render` function handed to the source hook's `onFrame` worklet. Call it at most once per
 * frame with your encode function; skipping it drops the frame (nothing is published for it).
 *
 * @group WebGPU
 */
export type WebGpuFrameRenderFunction = (encode: (context: WebGpuFrameRenderContext) => void) => void;
