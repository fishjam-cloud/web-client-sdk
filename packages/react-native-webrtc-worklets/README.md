# @fishjam-cloud/react-native-webrtc-worklets

Run a worklet on every frame a Fishjam camera track captures. This is the optional
frame-processing tier of `@fishjam-cloud/react-native-webrtc`: apps that do not install
it compile no extra native code.

## Install

```sh
yarn add @fishjam-cloud/react-native-webrtc-worklets react-native-worklets
```

Peer dependencies: `@fishjam-cloud/react-native-webrtc`, `react-native-worklets` (>= 0.12.0)
and the `react-native-worklets/plugin` Babel plugin in the app. Requires the New
Architecture on both platforms.

### Android

The module is autolinked like any other. It compiles against the fork's public C++
header and links `libworklets.so`, so `react-native-worklets` must be an app dependency
(the Gradle build fails with a clear message otherwise). Camera frames are hardware
buffers, which need Android 8.0 (API 26) at runtime; on older devices `install()`
rejects with `E_UNSUPPORTED_API_LEVEL`. Frames are RGBA on Android: the camera tap
converts the camera texture before handing it over, and waits for that conversion to
finish before your callback runs.

## Usage

```ts
import { getCameraFrameProcessor } from '@fishjam-cloud/react-native-webrtc';
import { attachCameraFrameCallback } from '@fishjam-cloud/react-native-webrtc-worklets';

const processor = await getCameraFrameProcessor(cameraTrack);
const subscription = await attachCameraFrameCallback(processor, (frame) => {
  'worklet';
  // frame.nativeBuffer is a CVPixelBufferRef (iOS) or AHardwareBuffer* (Android) pointer;
  // valid until this returns.
  render(frame.nativeBuffer, frame.width, frame.height, frame.rotationDegrees);
});

subscription.remove();
```

The callback runs on a dedicated camera frame runtime, never on the JS thread. Frames are
admitted one at a time: while the callback holds a frame, newer ones are dropped. Only one
callback can be attached at a time.
