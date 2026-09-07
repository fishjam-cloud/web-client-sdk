import {
  createCameraTextureResolver,
  getOutputSurfaceFormat,
  resolveCameraTexture,
  useCameraWebGpuDevice,
  useVisionCameraWebGpuSource,
  type WebGpuFrameRenderFunction,
} from '@fishjam-cloud/react-native-vision-camera-source/webgpu';
import type {
  VideoEffectSession,
  VideoEffectStatus,
} from '@fishjam-cloud/video-effects';
import { useBackgroundBlur } from '@fishjam-cloud/video-effects/background-blur';
import { typeGpuPersonSegmentation } from '@fishjam-cloud/video-effects/segmentation/typegpu';
import { Asset } from 'expo-asset';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Frame } from 'react-native-vision-camera';
import { useCamera as useVisionCamera } from 'react-native-vision-camera';

const OUTPUT_WIDTH = 720;
const OUTPUT_HEIGHT = 1280;
const BLUR_RADIUS = 24;

const segmentationModel = Asset.fromModule(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../../../../fishjam-video-effects/assets/selfie_segmenter.ssgbin'),
);
const personSegmentation = typeGpuPersonSegmentation({
  modelUrl: segmentationModel.uri,
});

/**
 * Background blur, published as a custom video track.
 *
 * VisionCamera owns the camera here, which is why this publishes a *custom* track rather than
 * blurring `peer.cameraTrack`: on iOS two camera owners fight over the device, so Fishjam's own
 * camera has to stay off. Blurring the real camera track needs the native camera tap that does
 * not exist yet — see the plan's P3/P6/P9.
 */
export function useBlurCamera(enabled: boolean) {
  const { device, error: deviceError } = useCameraWebGpuDevice();
  const [effectSession, setEffectSession] = useState<VideoEffectSession | null>(
    null,
  );
  const [effectStatus, setEffectStatus] =
    useState<VideoEffectStatus>('loading');
  const [effectError, setEffectError] = useState<Error | null>(null);

  const backgroundBlur = useBackgroundBlur({
    segmentation: personSegmentation,
    radius: BLUR_RADIUS,
  });

  // The camera arrives as an external texture, which most pipelines cannot sample; this resolves
  // it into a plain texture the segmentation model can read.
  const resolvedCamera = useMemo(
    () =>
      device == null
        ? null
        : createCameraTextureResolver(device, {
            width: OUTPUT_WIDTH,
            height: OUTPUT_HEIGHT,
          }),
    [device],
  );

  useEffect(() => {
    if (device == null || !enabled) return;

    let active = true;
    let session: VideoEffectSession | null = null;
    setEffectStatus('loading');
    setEffectError(null);

    void backgroundBlur
      .create({
        device,
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        outputFormat: getOutputSurfaceFormat(),
        onStatus: (status, error) => {
          if (!active) return;
          setEffectStatus(status);
          setEffectError(error ?? null);
        },
      })
      .then((created) => {
        session = created;
        if (!active) {
          created.dispose();
          return;
        }
        setEffectSession(created);
        setEffectStatus('ready');
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setEffectStatus('error');
        setEffectError(
          cause instanceof Error ? cause : new Error(String(cause)),
        );
      });

    return () => {
      active = false;
      setEffectSession(null);
      session?.dispose();
    };
  }, [backgroundBlur, device, enabled]);

  useEffect(
    () => () => {
      resolvedCamera?.texture.destroy();
    },
    [resolvedCamera],
  );

  const onFrame = useCallback(
    (frame: Frame, render: WebGpuFrameRenderFunction) => {
      'worklet';
      if (effectSession == null || resolvedCamera == null) return;

      render((context) => {
        'worklet';
        // VisionCamera reports seconds on one platform and nanoseconds on the other.
        const timestampUs = Math.floor(
          frame.timestamp >= 1_000_000_000
            ? frame.timestamp / 1_000
            : frame.timestamp * 1_000_000,
        );

        resolveCameraTexture(
          context.device,
          resolvedCamera,
          context.cameraTexture,
          context.cameraWidth,
          context.cameraHeight,
          context.commandEncoder,
        );

        effectSession.offer({
          kind: 'gpu-texture',
          timestampUs,
          width: OUTPUT_WIDTH,
          height: OUTPUT_HEIGHT,
          texture: resolvedCamera.view,
          externalTexture: context.cameraTexture,
          commandEncoder: context.commandEncoder,
        });
        effectSession.encode({
          timestampUs,
          source: resolvedCamera.view,
          output: context.outputView,
          commandEncoder: context.commandEncoder,
          externalTexture: context.cameraTexture,
        });
      });
    },
    [effectSession, resolvedCamera],
  );

  const source = useVisionCameraWebGpuSource('blur-camera', {
    enabled,
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    device: device ?? undefined,
    onFrame,
  });

  useVisionCamera({
    device: 'front',
    isActive: enabled,
    outputs: [source.frameOutput],
  });

  return {
    ...source,
    error: source.error ?? deviceError,
    effectError,
    effectStatus,
  };
}
