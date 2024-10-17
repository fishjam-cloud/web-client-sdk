import type { AudioDevice } from "../../types/public";
import { useDeviceManager } from "../deviceManagers/useDeviceManager";
import { useFishjamContext } from "../useFishjamContext";

/**
 *
 * @category Devices
 */
export function useMicrophone(): AudioDevice {
  const { audioTrackManager, audioDeviceManagerRef } = useFishjamContext();
  const { deviceState, status } = useDeviceManager(audioDeviceManagerRef.current);

  const { currentTrack, ...trackManager } = audioTrackManager;

  const stream = deviceState.media?.stream ?? null;
  const currentMiddleware = deviceState.currentMiddleware ?? null;
  const isStreaming = Boolean(currentTrack?.stream);
  const track = stream?.getAudioTracks()[0] ?? null;
  const trackId = currentTrack?.trackId ?? null;
  const devices = deviceState.devices ?? [];
  const activeDevice = deviceState.media?.deviceInfo ?? null;
  const isAudioPlaying = currentTrack?.vadStatus === "speech";
  const isMuted = !deviceState.media?.enabled;
  const deviceError = deviceState.error ?? null;
  const isDeviceEnabled = Boolean(deviceState.media);

  return {
    ...trackManager,
    currentMiddleware,
    isDeviceEnabled,
    status,
    stream,
    track,
    isStreaming,
    trackId,
    devices,
    activeDevice,
    isMuted,
    deviceError,
    isAudioPlaying,
  };
}
