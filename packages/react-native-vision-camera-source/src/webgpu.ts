/// <reference types="@webgpu/types" />
/**
 * WebGPU tier of the VisionCamera → Fishjam adapter — render your own content into the published
 * video. Requires `react-native-webgpu` (an optional peer of this package; only this entry point
 * loads it).
 *
 * - {@link useVisionCameraWebGpuSource} — the source hook: camera in, your WebGPU passes,
 *   published video out.
 * - {@link useVisionCameraWebGpuTrack} — the same without publishing, for handing the track
 *   back from a camera track middleware.
 * - Re-exports the WebGPU camera toolkit from
 *   `@fishjam-cloud/react-native-custom-video-source/webgpu` — `createCameraShaderBindings` /
 *   `sampleCamera`, `createCameraPassthroughPipeline`, the cropping helpers, the shared
 *   camera-import device, and so on — so you can build your shaders alongside the hook.
 *
 * @packageDocumentation
 */

export {
  useVisionCameraWebGpuSource,
  type UseVisionCameraWebGpuSourceOptions,
  type UseVisionCameraWebGpuSourceResult,
  useVisionCameraWebGpuTrack,
  type UseVisionCameraWebGpuTrackOptions,
} from './webgpu/useVisionCameraWebGpuSource';
export * from '@fishjam-cloud/react-native-custom-video-source/webgpu';
