import type { Device } from "../../types/public";
import { useFishjamContext } from "../useFishjamContext";
import { useDeviceApi } from "./useDeviceApi";

/**
 *
 * @category Devices
 */
export function useMicrophone(): Device {
  const { audioTrackManager, audioDeviceManagerRef } = useFishjamContext();

  return useDeviceApi({ trackManager: audioTrackManager, deviceManager: audioDeviceManagerRef.current });
}
