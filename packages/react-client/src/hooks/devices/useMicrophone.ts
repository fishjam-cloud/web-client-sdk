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

  // TODO FCE-720: remove this property
  const isAudioPlaying = audioTrackManager.currentTrack?.vadStatus === "speech";

  return {
    ...api,
    isAudioPlaying,
  };
}
