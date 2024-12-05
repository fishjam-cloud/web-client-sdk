import type { Device } from "../../types/public";
import { useDeviceApi } from "../internal/device/useDeviceApi";
import { useFishjamContext } from "../internal/useFishjamContext";

/**
 *
 * @category Devices
 */
export function useMicrophone(): Device {
  const { audioTrackManager, audioDeviceManagerRef } = useFishjamContext();

  return useDeviceApi({ trackManager: audioTrackManager, deviceManager: audioDeviceManagerRef.current });
}
