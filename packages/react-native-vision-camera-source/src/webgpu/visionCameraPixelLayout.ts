import type { CameraPixelLayout } from '@fishjam-cloud/react-native-custom-video-source/webgpu';
import { Platform } from 'react-native';

/**
 * The pixel layout of the camera texture VisionCamera delivers on this platform, for
 * `createCameraShaderBindings` and `createCameraPassthroughPipeline`. On Android the frame is an
 * opaque YCbCr hardware buffer that samples as raw [Y, Cb, Cr]; on iOS it samples as RGB.
 *
 * @group WebGPU
 */
export function visionCameraPixelLayout(): CameraPixelLayout {
  return Platform.OS === 'android' ? 'ycbcr-raw' : 'rgb';
}
