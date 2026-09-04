import { useCamera } from '@fishjam-cloud/react-native-client';
import { useEffect, useState } from 'react';

import { startSyntheticFrameSource, type SyntheticFrameSource } from './syntheticFrameSource';
import { useSurfaceWebGpuDevice } from './useSurfaceWebGpuDevice';

const FRAME_SOURCE_OPTIONS = { width: 720, height: 1280, poolSize: 3, framesPerSecond: 30 };

export type SyntheticCameraEffectStatus = 'idle' | 'waiting-for-gpu' | 'applying' | 'running' | 'error';

export interface UseSyntheticCameraEffectResult {
  status: SyntheticCameraEffectStatus;
  error: Error | null;
}

/**
 * S0-A harness: replaces the camera track with a synthetic pooled track through the normal
 * `setCameraTrackMiddleware` path, so we can check on a device whether `peer.cameraTrack` still
 * resolves to it — locally and for a remote peer.
 */
export function useSyntheticCameraEffect(enabled: boolean): UseSyntheticCameraEffectResult {
  const { device, error: deviceError } = useSurfaceWebGpuDevice();
  const { setCameraTrackMiddleware, isCameraOn, currentCamera } = useCamera();
  const [status, setStatus] = useState<SyntheticCameraEffectStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  const currentCameraDeviceId = currentCamera?.deviceId;

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }
    if (device == null) {
      setStatus('waiting-for-gpu');
      return;
    }

    // `useTrackMiddleware` never re-applies a middleware when the raw track changes, so this
    // effect re-runs on camera on/off and camera switch to put it back. `isCameraOn` is a boolean
    // and `currentCamera` is raw-side, so neither changes when the middleware swaps the track —
    // widening these deps to the track or the stream would loop.
    let active = true;
    let source: SyntheticFrameSource | null = null;
    setStatus('applying');
    setError(null);

    void setCameraTrackMiddleware(async () => {
      const started = await startSyntheticFrameSource(device, FRAME_SOURCE_OPTIONS);
      if (!active) {
        await started.stop();
        throw new Error('useSyntheticCameraEffect: torn down while starting');
      }
      source = started;
      setStatus('running');
      return {
        track: started.stream.getVideoTracks()[0],
        onClear: () => {
          void started.stop();
        },
      };
    }).catch((cause: unknown) => {
      if (!active) return;
      setStatus('error');
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    });

    return () => {
      active = false;
      void setCameraTrackMiddleware(null);
      void source?.stop();
    };
  }, [enabled, device, isCameraOn, currentCameraDeviceId, setCameraTrackMiddleware]);

  return { status, error: error ?? deviceError };
}
