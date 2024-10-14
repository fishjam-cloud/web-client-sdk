import type { AudioDevice } from "../../types/public";
import { useFishjamContext } from "../useFishjamContext";
import { useDeviceApi } from "./useDeviceApi";

/**
 *
 * @category Devices
 */
export function useMicrophone(): AudioDevice {
  const { audioTrackManager, audioDeviceManagerRef } = useFishjamContext();

  const api = useDeviceApi({ trackManager: audioTrackManager, deviceManager: audioDeviceManagerRef.current });
  const isAudioPlaying = audioTrackManager.currentTrack?.vadStatus === "speech";

  return {
    ...api,
    isAudioPlaying,
  };
}
