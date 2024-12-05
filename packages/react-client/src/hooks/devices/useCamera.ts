import type { Device } from "../../types/public";
import { useDeviceApi } from "../internal/device/useDeviceApi";
import { useFishjamContext } from "../internal/useFishjamContext";

/**
 *
 * @category Devices
 */
export function useCamera(): Device {
  const { videoTrackManager, videoDeviceManagerRef } = useFishjamContext();

  return useDeviceApi({ trackManager: videoTrackManager, deviceManager: videoDeviceManagerRef.current });
}
