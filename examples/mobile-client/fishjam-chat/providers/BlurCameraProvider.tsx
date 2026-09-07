import {
  computeAspectFillCrop,
  createCameraPassthroughPipeline,
  createCameraTextureResolver,
  encodeCameraPassthrough,
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
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Frame } from 'react-native-vision-camera';
import { useCamera as useVisionCamera } from 'react-native-vision-camera';

const OUTPUT_WIDTH = 720;
const OUTPUT_HEIGHT = 1280;
const BLUR_RADIUS = 24;
const OUTPUT_ASPECT = OUTPUT_WIDTH / OUTPUT_HEIGHT;

const segmentationModel = Asset.fromModule(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../../../../fishjam-video-effects/assets/selfie_segmenter.ssgbin'),
);
const personSegmentation = typeGpuPersonSegmentation({
  modelUrl: segmentationModel.uri,
});

type BlurCameraStream = ReturnType<
  typeof useVisionCameraWebGpuSource
>['stream'];

interface BlurCameraValue {
  isBlurEnabled: boolean;
  toggleBlur: () => void;
  /** The published blurred stream; render it while blur is on. */
  stream: BlurCameraStream;
  status: VideoEffectStatus;
  error: Error | null;
}

const BlurCameraContext = createContext<BlurCameraValue | null>(null);

/**
 * Owns background blur for the whole app, so the preview screen and the call screen share one
 * camera session and one published track rather than each starting their own.
 *
 * VisionCamera owns the camera here, which is why blur is published as a *custom* track: on iOS
 * two camera owners fight over the device, so Fishjam's own camera has to be stopped while blur
 * runs. Blurring `peer.cameraTrack` directly needs the native camera tap that does not exist yet.
 */
export function BlurCameraProvider({ children }: { children: ReactNode }) {
  const [isBlurEnabled, setIsBlurEnabled] = useState(false);
  const { device, error: deviceError } = useCameraWebGpuDevice();
  const [effectSession, setEffectSession] = useState<VideoEffectSession | null>(
    null,
  );
  const [status, setStatus] = useState<VideoEffectStatus>('loading');
  const [effectError, setEffectError] = useState<Error | null>(null);

  const backgroundBlur = useBackgroundBlur({
    segmentation: personSegmentation,
    radius: BLUR_RADIUS,
  });

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

  // Renders the untouched camera. Without it a frame that arrives before the segmentation model
  // is ready would simply be dropped, and the published track would be black — indistinguishable
  // from the camera not delivering frames at all.
  const passthrough = useMemo(
    () =>
      device == null
        ? null
        : createCameraPassthroughPipeline(device, {
            outputFormat: getOutputSurfaceFormat(),
          }),
    [device],
  );

  // Built as soon as the GPU device exists, not when blur is switched on. Doing it on the toggle
  // put the shader pipelines, the model download and TypeGPU's resolve into one synchronous burst
  // on the JS thread at the moment of the tap, which froze the app.
  useEffect(() => {
    if (device == null) return;

    let active = true;
    let session: VideoEffectSession | null = null;
    setStatus('loading');
    setEffectError(null);

    void backgroundBlur
      .create({
        device,
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        outputFormat: getOutputSurfaceFormat(),
        onStatus: (nextStatus, error) => {
          if (!active) return;
          setStatus(nextStatus);
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
        setStatus('ready');
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setStatus('error');
        setEffectError(
          cause instanceof Error ? cause : new Error(String(cause)),
        );
      });

    return () => {
      active = false;
      setEffectSession(null);
      session?.dispose();
    };
  }, [backgroundBlur, device]);

  useEffect(
    () => () => {
      resolvedCamera?.texture.destroy();
    },
    [resolvedCamera],
  );

  const onFrame = useCallback(
    (frame: Frame, render: WebGpuFrameRenderFunction) => {
      'worklet';
      render((context) => {
        'worklet';
        if (effectSession == null || resolvedCamera == null) {
          if (passthrough == null) return;
          encodeCameraPassthrough(
            context.device,
            passthrough,
            context.cameraTexture,
            context.outputView,
            context.commandEncoder,
            computeAspectFillCrop(
              context.cameraWidth,
              context.cameraHeight,
              OUTPUT_ASPECT,
            ),
          );
          return;
        }

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
    [effectSession, resolvedCamera, passthrough],
  );

  const source = useVisionCameraWebGpuSource('blur-camera', {
    enabled: isBlurEnabled,
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    device: device ?? undefined,
    onFrame,
  });

  useVisionCamera({
    device: 'front',
    isActive: isBlurEnabled,
    outputs: [source.frameOutput],
  });

  const toggleBlur = useCallback(() => {
    setIsBlurEnabled((enabled) => !enabled);
  }, []);

  const value = useMemo<BlurCameraValue>(
    () => ({
      isBlurEnabled,
      toggleBlur,
      stream: source.stream,
      status,
      error: effectError ?? source.error ?? deviceError,
    }),
    [
      isBlurEnabled,
      toggleBlur,
      source.stream,
      source.error,
      status,
      effectError,
      deviceError,
    ],
  );

  return (
    <BlurCameraContext.Provider value={value}>
      {children}
    </BlurCameraContext.Provider>
  );
}

export function useBlurCamera(): BlurCameraValue {
  const value = useContext(BlurCameraContext);
  if (!value) {
    throw new Error('useBlurCamera must be used within BlurCameraProvider');
  }
  return value;
}
