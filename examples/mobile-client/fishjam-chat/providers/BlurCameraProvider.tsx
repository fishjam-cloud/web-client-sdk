import { useCamera, type TrackMiddleware } from '@fishjam-cloud/react-native-client';
import {
  computeAspectFillCrop,
  createCameraPassthroughPipeline,
  createCameraFrameProcessorSession,
  type CameraFrameInfo,
  createCameraTextureResolver,
  encodeCameraPassthrough,
  getOutputSurfaceFormat,
  resolveCameraTexture,
  useCameraWebGpuDevice,
  type WebGpuFrameRenderFunction,
} from '@fishjam-cloud/video-effects/fishjam-react-native';
import type { VideoEffectSession, VideoEffectStatus } from '@fishjam-cloud/video-effects';
import { useBackgroundBlur } from '@fishjam-cloud/video-effects/background-blur';
import { typeGpuPersonSegmentation } from '@fishjam-cloud/video-effects/segmentation/typegpu';
import { Asset } from 'expo-asset';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const OUTPUT_WIDTH = 720;
const OUTPUT_HEIGHT = 1280;
const BLUR_RADIUS = 24;
const OUTPUT_ASPECT = OUTPUT_WIDTH / OUTPUT_HEIGHT;

const segmentationModel = Asset.fromModule(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../../../../fishjam-video-effects/assets/selfie_segmenter.ssgbin'),
);
const personSegmentation = typeGpuPersonSegmentation({ modelUrl: segmentationModel.uri });

interface BlurCameraValue {
  isBlurEnabled: boolean;
  toggleBlur: () => void;
  status: VideoEffectStatus;
  error: Error | null;
}

const BlurCameraContext = createContext<BlurCameraValue | null>(null);

/**
 * Owns background blur for the whole app. Blur runs on Fishjam's *own* camera track: the provider
 * registers a camera track middleware that taps the live camera, renders the blurred frames into a
 * pooled surface and republishes them as the peer's camera track. No VisionCamera and no separate
 * custom track — the preview screen and the call screen share one camera and one middleware.
 */
export function BlurCameraProvider({ children }: { children: ReactNode }) {
  const [isBlurEnabled, setIsBlurEnabled] = useState(false);
  const { device, error: deviceError } = useCameraWebGpuDevice();
  const { setCameraTrackMiddleware } = useCamera();

  const [effectSession, setEffectSession] = useState<VideoEffectSession | null>(null);
  const [status, setStatus] = useState<VideoEffectStatus>('loading');
  const [effectError, setEffectError] = useState<Error | null>(null);

  const backgroundBlur = useBackgroundBlur({ segmentation: personSegmentation, radius: BLUR_RADIUS });

  // A plain rgba8 texture the live camera is resolved into each frame; the effect samples it.
  const resolvedCamera = useMemo(
    () => (device == null ? null : createCameraTextureResolver(device, { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, cameraPixelLayout: 'rgb' })),
    [device],
  );

  // Shows the untouched camera until the segmentation model is ready, so the published track is
  // never black while blur is warming up.
  const passthrough = useMemo(
    () => (device == null ? null : createCameraPassthroughPipeline(device, { cameraPixelLayout: 'rgb', outputFormat: getOutputSurfaceFormat() })),
    [device],
  );

  // Built as soon as the GPU device exists, not when blur is switched on: the model download and
  // pipeline build are the expensive part, and doing them on the toggle froze the app.
  useEffect(() => {
    if (device == null) return;

    let active = true;
    let session: VideoEffectSession | null = null;

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
        setEffectError(cause instanceof Error ? cause : new Error(String(cause)));
      });

    return () => {
      active = false;
      setEffectSession(null);
      setStatus('loading');
      setEffectError(null);
      session?.dispose();
    };
  }, [backgroundBlur, device]);

  useEffect(() => () => resolvedCamera?.texture.destroy(), [resolvedCamera]);

  // The per-frame worklet: draw the blur when the effect is ready, otherwise the plain camera.
  const frameKernel = useCallback(
    (frame: CameraFrameInfo, render: WebGpuFrameRenderFunction) => {
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
            computeAspectFillCrop(context.cameraWidth, context.cameraHeight, OUTPUT_ASPECT),
          );
          return;
        }

        const timestampUs = Math.floor(frame.timestampNanoseconds / 1_000);
        const kernel = effectSession.frameKernel;

        resolveCameraTexture(
          context.device,
          resolvedCamera,
          context.cameraTexture,
          context.cameraWidth,
          context.cameraHeight,
          context.commandEncoder,
        );
        kernel.offer(kernel.state, {
          kind: 'gpu-texture',
          timestampUs,
          width: resolvedCamera.width,
          height: resolvedCamera.height,
          texture: resolvedCamera.view,
          commandEncoder: context.commandEncoder,
        });
        kernel.encode(
          kernel.state,
          {
            timestampUs,
            source: resolvedCamera.view,
            output: context.outputView,
            commandEncoder: context.commandEncoder,
          },
          { radius: BLUR_RADIUS },
        );
      });
    },
    [effectSession, resolvedCamera, passthrough],
  );

  // Register the camera track middleware while blur is on; clear it while off. Rebuilt when the
  // effect finishes loading so its blurred frames replace the passthrough ones.
  useEffect(() => {
    if (!isBlurEnabled || device == null || resolvedCamera == null || passthrough == null) {
      void setCameraTrackMiddleware(null);
      return;
    }

    const middleware: TrackMiddleware = async (rawTrack) => {
      const session = await createCameraFrameProcessorSession({
        track: rawTrack,
        device,
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        frameKernel,
      });
      return { track: session.track, onClear: () => void session.dispose() };
    };

    void setCameraTrackMiddleware(middleware);

    return () => {
      void setCameraTrackMiddleware(null);
    };
  }, [isBlurEnabled, device, resolvedCamera, passthrough, frameKernel, setCameraTrackMiddleware]);

  const toggleBlur = useCallback(() => setIsBlurEnabled((enabled) => !enabled), []);

  useEffect(() => {
    if (!__DEV__) return;
    // Lets a debugger flip blur without touching the screen (see the `__fjRouter` hook in _layout).
    (globalThis as { __fjToggleBlur?: () => void }).__fjToggleBlur = toggleBlur;
  }, [toggleBlur]);

  const value = useMemo<BlurCameraValue>(
    () => ({ isBlurEnabled, toggleBlur, status, error: effectError ?? deviceError }),
    [isBlurEnabled, toggleBlur, status, effectError, deviceError],
  );

  return <BlurCameraContext.Provider value={value}>{children}</BlurCameraContext.Provider>;
}

export function useBlurCamera(): BlurCameraValue {
  const value = useContext(BlurCameraContext);
  if (!value) {
    throw new Error('useBlurCamera must be used within BlurCameraProvider');
  }
  return value;
}
