import type { VideoEffectStatus } from '@fishjam-cloud/video-effects';
import { useBackgroundBlur } from '@fishjam-cloud/video-effects/background-blur';
import { useFishjamCameraEffect } from '@fishjam-cloud/video-effects/fishjam-react-native';
import { typeGpuPersonSegmentation } from '@fishjam-cloud/video-effects/segmentation/typegpu';
import { Asset } from 'expo-asset';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const BLUR_RADIUS = 24;

const segmentationModel = Asset.fromModule(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@fishjam-cloud/video-effects/assets/selfie_segmenter.ssgbin'),
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
 * Owns background blur for the whole app. Blur runs on Fishjam's own camera track through the
 * camera-track middleware, so the preview screen and the call screen share one camera.
 */
export function BlurCameraProvider({ children }: { children: ReactNode }) {
  const [isBlurEnabled, setIsBlurEnabled] = useState(false);
  const backgroundBlur = useBackgroundBlur({ segmentation: personSegmentation, radius: BLUR_RADIUS });
  const { status, error } = useFishjamCameraEffect(isBlurEnabled ? backgroundBlur : null);
  const toggleBlur = useCallback(() => setIsBlurEnabled((enabled) => !enabled), []);

  useEffect(() => {
    if (!__DEV__) return;
    // Lets a debugger flip blur without touching the screen (see the `__fjRouter` hook in _layout).
    (globalThis as { __fjToggleBlur?: () => void }).__fjToggleBlur = toggleBlur;
  }, [toggleBlur]);

  const value = useMemo(
    () => ({ isBlurEnabled, toggleBlur, status, error }),
    [isBlurEnabled, toggleBlur, status, error],
  );
  return <BlurCameraContext.Provider value={value}>{children}</BlurCameraContext.Provider>;
}

export function useBlurCamera(): BlurCameraValue {
  const value = useContext(BlurCameraContext);
  if (value == null) {
    throw new Error('useBlurCamera must be used inside BlurCameraProvider');
  }
  return value;
}
