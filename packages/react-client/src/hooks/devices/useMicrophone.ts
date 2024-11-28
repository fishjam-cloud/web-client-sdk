import type { Device } from "../../types/public";
import { useFishjamContext } from "../internal/useFishjamContext";
import { useDeviceApi } from "../internal/device/useDeviceApi";

/**
 *
 * @category Devices
 */
export function useMicrophone(): Device {
  const { audioTrackManager, audioDeviceManagerRef } = useFishjamContext();

  return useDeviceApi({ trackManager: audioTrackManager, deviceManager: audioDeviceManagerRef.current });
}
