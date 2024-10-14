import type { Device } from "../../types/public";
import { useFishjamContext } from "../useFishjamContext";
import { useDeviceApi } from "./useDeviceApi";

/**
 *
 * @category Devices
 */
export function useCamera(): Device {
  const { videoTrackManager, videoDeviceManagerRef } = useFishjamContext();

  return useDeviceApi({ trackManager: videoTrackManager, deviceManager: videoDeviceManagerRef.current });
}
