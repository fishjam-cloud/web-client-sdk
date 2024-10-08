import type { Device } from "../../types/public";
import { useVideoDeviceManager } from "../deviceManagers/useVideoDeviceManager";
import { useFishjamContext } from "../useFishjamContext";
import { useProcessedPreviewStream } from "../useProcessedPreviewStream";

/**
 *
 * @category Devices
 */
export function useCamera(): Device {
  const { videoTrackManager } = useFishjamContext();
  const { deviceState, status } = useVideoDeviceManager();
  const { currentTrack, ...trackManager } = videoTrackManager;
  const processedPreviewStream = useProcessedPreviewStream(videoTrackManager, deviceState.media?.track);

  const stream = currentTrack?.stream ?? processedPreviewStream ?? deviceState.media?.stream ?? null;
  const isStreaming = Boolean(currentTrack?.stream);
  const track = stream?.getAudioTracks()[0] ?? null;
  const trackId = currentTrack?.trackId ?? null;
  const devices = deviceState.devices ?? [];
  const activeDevice = deviceState.media?.deviceInfo ?? null;

  return {
    ...trackManager,
    status,
    stream,
    devices,
    activeDevice,
    isStreaming,
    track,
    trackId,
  };
}
