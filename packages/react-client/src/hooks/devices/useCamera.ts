import type { Device } from "../../types/public";
import { useDeviceManager } from "../deviceManagers/useDeviceManager";
import { useFishjamContext } from "../useFishjamContext";

/**
 *
 * @category Devices
 */
export function useCamera(): Device {
  const { videoTrackManager, videoDeviceManagerRef } = useFishjamContext();
  const { deviceState, status } = useDeviceManager(videoDeviceManagerRef.current);

  const { currentTrack, ...trackManager } = videoTrackManager;

  const stream = deviceState.media?.stream ?? null;
  const currentMiddleware = deviceState.currentMiddleware ?? null;
  const isStreaming = Boolean(currentTrack?.stream);
  const track = stream?.getAudioTracks()[0] ?? null;
  const trackId = currentTrack?.trackId ?? null;
  const devices = deviceState.devices ?? [];
  const activeDevice = deviceState.media?.deviceInfo ?? null;
  const isMuted = !deviceState.media?.enabled;
  const deviceError = deviceState.error ?? null;
  const isDeviceEnabled = Boolean(deviceState.media);

  return {
    ...trackManager,
    currentMiddleware,
    status,
    stream,
    track,
    devices,
    activeDevice,
    deviceError,
    isMuted,
    isStreaming,
    trackId,
    isDeviceEnabled,
  };
}
