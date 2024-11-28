import type { Device } from "../../types/public";
import { useFishjamContext } from "../internal/useFishjamContext";
import { useDeviceApi } from "../internal/device/useDeviceApi";

/**
 *
 * @category Devices
 */
export function useCamera(): Device {
  const { videoTrackManager, videoDeviceManagerRef } = useFishjamContext();

  return useDeviceApi({ trackManager: videoTrackManager, deviceManager: videoDeviceManagerRef.current });
}
