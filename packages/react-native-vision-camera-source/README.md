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

```tsx
import {
  useVisionCameraWebGpuSource,
  useCameraWebGpuDevice,
  createCameraShaderBindings,
  getOutputSurfaceFormat,
  type WebGpuFrameRenderFunction,
} from '@fishjam-cloud/react-native-vision-camera-source/webgpu';

const { device } = useCameraWebGpuDevice();
const effect = useMemo(() => {
  if (device == null) return null;
  const cameraBindings = createCameraShaderBindings(device);
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [cameraBindings.bindGroupLayout] }),
    vertex: { module: device.createShaderModule({ code: FULL_SCREEN_TRIANGLE_WGSL }) },
    fragment: {
      module: device.createShaderModule({
        code:
          cameraBindings.shaderCode +
          `@fragment fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
             let color = sampleCamera(uv); // upright RGB on BOTH platforms
             return vec4f(vec3f(dot(color.rgb, vec3f(0.299, 0.587, 0.114))), 1.0); // grayscale
           }`,
      }),
      targets: [{ format: getOutputSurfaceFormat() }],
    },
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
monorepo. `yarn build` compiles `src/` to `dist/` with `tsc`.
