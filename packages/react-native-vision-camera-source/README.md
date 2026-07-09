# `@fishjam-cloud/react-native-vision-camera-source`

Publish a [VisionCamera](https://react-native-vision-camera.com) (v5) feed to
[Fishjam](https://fishjam.io) — as-is, with inference worklets running on the same frames, or with
your own WebGPU rendering drawn into the published video.

The hooks follow the Fishjam source-hook family (`useCamera`, `useScreenShare`,
`useCustomSource`): they create the underlying track, publish it, and clean up on unmount. Your
component stays fully declarative.

## Prerequisites

- `react-native-vision-camera` **v5** and `react-native-vision-camera-worklets`
- [`react-native-worklets`](https://docs.swmansion.com/react-native-worklets/) with its Babel
  plugin configured (required by VisionCamera's frame outputs)
- `@fishjam-cloud/react-native-client` with your app wrapped in `FishjamProvider`
- New Architecture (custom video tracks require it)
- For the `/webgpu` entry: `react-native-webgpu` ≥ 0.5.15 (optional otherwise)

## Publish the camera

```tsx
import { useCamera as useVisionCamera, useCameraDevices, useCameraPermission } from 'react-native-vision-camera';
import { RTCView } from '@fishjam-cloud/react-native-client';
import { useVisionCameraSource } from '@fishjam-cloud/react-native-vision-camera-source';

function CameraPublisher() {
  const { hasPermission } = useCameraPermission();
  const cameraDevice = useCameraDevices().find((device) => device.position === 'front');

  const { frameOutput, stream } = useVisionCameraSource('my-camera');

  useVisionCamera({ device: cameraDevice, isActive: hasPermission, outputs: [frameOutput] });

  return stream ? <RTCView mediaStream={stream} objectFit="cover" /> : null; // self-view
}
```

Frames are handed to Fishjam without copying pixels.

## Publish + run inference

```tsx
const onFrame = useCallback(
  (frame: Frame) => {
    'worklet';
    const pose = detectPose(frame); // any VisionCamera frame-processor plugin
    poseResults.setBlocking(pose);
  },
  [detectPose],
);

const { frameOutput } = useVisionCameraSource('my-camera', { onFrame });
```

The frame is valid only inside your synchronous callback — the hook releases it afterwards.

## Render with WebGPU

The `/webgpu` entry draws your own content — shaders, overlays, effects — into the published
video with zero pixel copies. The hook owns the output surfaces, GPU synchronization with the
encoder, timestamps, and frame lifetimes; your worklet only encodes passes.

Shaders are authored in [TypeGPU](https://docs.swmansion.com/TypeGPU/) (TGSL) — typed functions
that compile to WGSL. Enable the transform by adding `unplugin-typegpu` to your app's Babel config.

```tsx
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { dot } from 'typegpu/std';
import {
  useVisionCameraWebGpuSource,
  useCameraWebGpuDevice,
  createCameraShaderBindings,
  getOutputSurfaceFormat,
  type WebGpuFrameRenderFunction,
} from '@fishjam-cloud/react-native-vision-camera-source/webgpu';

// Full-screen triangle; uv spans the visible area.
const vertexMain = tgpu.vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { position: d.builtin.position, uv: d.location(0, d.vec2f) },
})((input) => {
  const positions = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];
  const p = positions[input.vertexIndex];
  return { position: d.vec4f(p.x, p.y, 0, 1), uv: d.vec2f((p.x + 1) * 0.5, 1 - (p.y + 1) * 0.5) };
});

const { device } = useCameraWebGpuDevice();
const effect = useMemo(() => {
  if (device == null) return null;
  const cameraBindings = createCameraShaderBindings(device);
  // Call cameraBindings.sampleCamera(uv) from your fragment — the platform's YUV decode is handled.
  const fragmentMain = tgpu.fragmentFn({ in: { uv: d.location(0, d.vec2f) }, out: d.vec4f })((input) => {
    const color = cameraBindings.sampleCamera(input.uv);
    const gray = dot(color.xyz, d.vec3f(0.299, 0.587, 0.114)); // grayscale
    return d.vec4f(gray, gray, gray, 1);
  });
  // TypeGPU can't emit the external-texture binding, so prepend cameraBindings.bindingDeclarations.
  const module = device.createShaderModule({
    code: cameraBindings.bindingDeclarations + tgpu.resolve({ externals: { vertexMain, fragmentMain } }),
  });
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [cameraBindings.bindGroupLayout] }),
    vertex: { module, entryPoint: 'vertexMain' },
    fragment: { module, entryPoint: 'fragmentMain', targets: [{ format: getOutputSurfaceFormat() }] },
  });
  return { cameraBindings, pipeline };
}, [device]);

const onFrame = useCallback(
  (frame: Frame, render: WebGpuFrameRenderFunction) => {
    'worklet';
    if (effect == null) return; // drop until the pipeline is ready
    render(({ commandEncoder, outputTexture, cameraBindGroup }) => {
      const pass = commandEncoder.beginRenderPass({
        colorAttachments: [{ view: outputTexture.createView(), loadOp: 'clear', storeOp: 'store' }],
      });
      pass.setPipeline(effect.pipeline);
      pass.setBindGroup(0, cameraBindGroup!);
      pass.draw(3);
      pass.end();
    });
  },
  [effect],
);

const { frameOutput, stream } = useVisionCameraWebGpuSource('my-camera', {
  width: 720,
  height: 1280,
  cameraShaderBindings: effect?.cameraBindings,
  onFrame,
});
useVisionCamera({ device: cameraDevice, isActive: true, outputs: [frameOutput] });
```

Prefer zero WGSL? `createCameraPassthroughPipeline` + `encodeCameraPassthrough` publish the
camera through the same pipeline (crop and platform color handling included) and compose with
your own overlay passes. Pipelines that cannot sample `texture_external` can resolve the camera
into a plain texture with `createCameraTextureResolver`.

> Verify camera + WebGPU behavior on **physical devices** — the iOS Simulator cannot import the
> camera's YUV textures.

## Development

This package is part of the [web-client-sdk](https://github.com/fishjam-cloud/web-client-sdk)
monorepo. `yarn build` compiles `src/` to `dist/` with `react-native-builder-bob` (Babel +
`unplugin-typegpu` for the TGSL shaders, `tsc` for type definitions).
