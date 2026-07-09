import type { CameraOrientation } from 'react-native-vision-camera';

/**
 * Maps a VisionCamera frame orientation to the clockwise rotation, in degrees, needed to bring the
 * frame's pixel data upright: `'up'` → 0, `'right'` → 90, `'down'` → 180, `'left'` → 270.
 *
 * The source hooks apply this automatically. It is exported for advanced consumers who wire the
 * low-level frame APIs from `@fishjam-cloud/react-native-webrtc` themselves.
 *
 * Worklet-safe: call it from a frame callback or from the JS thread.
 *
 * @param orientation A VisionCamera `Frame.orientation` value.
 * @group Utilities
 */
export function rotationDegreesFromOrientation(orientation: CameraOrientation): 0 | 90 | 180 | 270 {
  'worklet';
  if (orientation === 'right') {
    return 90;
  }
  if (orientation === 'down') {
    return 180;
  }
  if (orientation === 'left') {
    return 270;
  }
  return 0;
}
