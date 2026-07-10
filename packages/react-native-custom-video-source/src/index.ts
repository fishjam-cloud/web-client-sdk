/**
 * Publish your own video frames to Fishjam.
 *
 * Source-lifecycle hooks that create a custom video track, publish it, and clean it up — you
 * supply the frames from any source. Two modes, picked by how you produce frames:
 *
 * - {@link useManagedForwardTrack} — you already have finished native buffers (a camera, a native
 *   ML pipeline, a compositor); forward each buffer pointer with `forwardFrame` from
 *   `@fishjam-cloud/react-native-webrtc`.
 * - {@link useManagedPooledTrack} — you render the frames yourself; allocate a surface pool, draw
 *   into it, and hand each frame back with `pushFrame`. The `@fishjam-cloud/react-native-custom-video-source/webgpu`
 *   entry point provides a WebGPU camera-rendering toolkit for this mode.
 *
 * For a ready-made VisionCamera integration on top of this, use
 * `@fishjam-cloud/react-native-vision-camera-source`.
 *
 * @packageDocumentation
 */

export { useManagedForwardTrack } from './internal/useManagedForwardTrack';
export { useManagedPooledTrack, type WorkletBufferDescriptor } from './internal/useManagedPooledTrack';
