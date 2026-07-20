# `@fishjam-cloud/react-native-custom-video-source`

Publish your own video frames to Fishjam from **any** frame source. This is the generic layer
under [`@fishjam-cloud/react-native-vision-camera-source`](../react-native-vision-camera-source) —
use that package if your source is [VisionCamera](https://react-native-vision-camera.com); use this
one directly for any other source (a native ML pipeline, a compositor, your own renderer).

There are two modes, picked by **how you produce frames**:

- **Forwarding** — you already have finished native buffers. `useManagedForwardTrack()` creates and
  owns the track; hand each buffer pointer to `forwardFrame` from `@fishjam-cloud/react-native-webrtc`.
- **Render-target (pooled)** — you render the frames yourself. `useManagedPooledTrack()` allocates a
  surface pool; draw into it and hand each frame back with `pushFrame`. The
  [`/webgpu`](#webgpu-camera-toolkit) entry point provides a WebGPU camera-rendering toolkit for this
  mode.

Each hook owns the track's async lifecycle — creation, the published `stream`, and teardown — so you
only feed frames. Must be used under `FishjamProvider` from `@fishjam-cloud/react-native-client`.

## Prerequisites

- `@fishjam-cloud/react-native-webrtc` and `@fishjam-cloud/react-native-client` (with your app wrapped
  in `FishjamProvider`)
- New Architecture (custom video tracks require it)
- For the `/webgpu` entry only: `react-native-webgpu` ≥ 0.5.15, plus `unplugin-typegpu` in your app's
  Babel config (the shaders are authored in [TypeGPU](https://docs.swmansion.com/TypeGPU/)), and
  **iOS 17+** for the Metal external-texture camera-import path.

## Forward finished buffers

```tsx
import { useManagedForwardTrack } from '@fishjam-cloud/react-native-custom-video-source';
import { forwardFrame } from '@fishjam-cloud/react-native-webrtc';
import { useCustomSource } from '@fishjam-cloud/react-native-client';

const { track, stream } = useManagedForwardTrack(/* enabled */ true);
// publish `stream` (e.g. via useCustomSource), then per frame:
forwardFrame(track, { nativeBuffer /* bigint CVPixelBufferRef / AHardwareBuffer* */ });
```

## Render your own frames

```tsx
import { useManagedPooledTrack } from '@fishjam-cloud/react-native-custom-video-source';
import { pushFrame } from '@fishjam-cloud/react-native-webrtc';

const { track, bufferDescriptors } = useManagedPooledTrack(true, 720, 1280, /* poolSize */ 3);
// import bufferDescriptors[i].surfaceHandle into your GPU, render into slot i, then:
pushFrame(track, { bufferIndex: i, timestampNs });
```

## WebGPU camera toolkit

`@fishjam-cloud/react-native-custom-video-source/webgpu` samples the live camera and helps you render
into the pooled surfaces:

- `createCameraShaderBindings` / `sampleCamera` — sample the camera from your own shaders, YUV decode
  handled per platform
- `createCameraPassthroughPipeline` / `encodeCameraPassthrough` — a ready-made camera→output pass
- `useCameraWebGpuDevice` — the shared, camera-import-capable `GPUDevice`
- `computeAspectFillCrop` / `computeSquareCrop` / `packFrameCropParams` — crop + orientation helpers

> Verify camera + WebGPU behavior on **physical devices** — the iOS Simulator cannot import the
> camera's YUV textures.

## Development

Part of the [web-client-sdk](https://github.com/fishjam-cloud/web-client-sdk) monorepo. `yarn build`
compiles `src/` to `dist/` with `react-native-builder-bob` (Babel + `unplugin-typegpu` for the TGSL
shaders, `tsc` for type definitions).
