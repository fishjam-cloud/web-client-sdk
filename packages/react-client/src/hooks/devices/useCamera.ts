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
  const isStreaming = Boolean(currentTrack?.stream);
  const track = stream?.getAudioTracks()[0] ?? null;
  const trackId = currentTrack?.trackId ?? null;
  const devices = deviceState.devices ?? [];
  const activeDevice = deviceState.media?.deviceInfo ?? null;

  return {
    ...trackManager,
    currentMiddleware: deviceState.currentMiddleware,
    status,
    stream,
    devices,
    activeDevice,
    isStreaming,
    track,
    trackId,
  };
}
