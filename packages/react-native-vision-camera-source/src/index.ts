/**
 * VisionCamera → Fishjam adapter.
 *
 * Source hooks that publish a VisionCamera feed to Fishjam, in the same family as
 * `useCustomSource`: the hook owns the track, the publishing, and the cleanup, and hands you a
 * VisionCamera frame output to plug into your own camera session.
 *
 * - {@link useVisionCameraSource} — publish the camera feed as-is (copy-free), optionally running
 *   inference worklets on the same frames.
 * - `useVisionCameraWebGpuSource` (from `@fishjam-cloud/react-native-vision-camera-source/webgpu`)
 *   — render your own WebGPU content into the published video.
 *
 * Requires VisionCamera 5 and `FishjamProvider` from `@fishjam-cloud/react-native-client`.
 *
 * @packageDocumentation
 */

export { rotationDegreesFromOrientation } from './orientation';
export {
  useVisionCameraSource,
  type UseVisionCameraSourceOptions,
  type UseVisionCameraSourceResult,
} from './useVisionCameraSource';
