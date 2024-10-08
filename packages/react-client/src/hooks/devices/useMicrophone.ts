import { AudioDevice } from "../../types/public";
import { useAudioDeviceManager } from "../deviceManagers/useAudioDeviceManager";
import { useFishjamContext } from "../useFishjamContext";
import { useProcessedPreviewStream } from "../useProcessedPreviewStream";

/**
 *
 * @category Devices
 */
export function useMicrophone(): AudioDevice {
  const { audioTrackManager } = useFishjamContext();

  const { deviceState, status } = useAudioDeviceManager();
  const { currentTrack, ...trackManager } = audioTrackManager;

  const processedPreviewStream = useProcessedPreviewStream(audioTrackManager, deviceState.media?.track);

  const stream = currentTrack?.stream ?? processedPreviewStream ?? deviceState.media?.stream ?? null;
  const isStreaming = Boolean(currentTrack?.stream);
  const track = stream?.getAudioTracks()[0] ?? null;
  const trackId = currentTrack?.trackId ?? null;
  const devices = deviceState.devices ?? [];
  const activeDevice = deviceState.media?.deviceInfo ?? null;
  const isAudioPlaying = currentTrack?.vadStatus === "speech";

  return {
    ...trackManager,
    status,
    stream,
    isStreaming,
    track,
    trackId,
    devices,
    activeDevice,
    isAudioPlaying,
  };
}
