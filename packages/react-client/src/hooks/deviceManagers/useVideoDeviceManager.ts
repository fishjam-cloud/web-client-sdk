import { useFishjamContext } from "../useFishjamContext";
import { useDeviceManager } from "./useDeviceManager";
/**
 *
 * @category Devices
 */
export const useVideoDeviceManager = () => {
  const { videoDeviceManagerRef } = useFishjamContext();
  const videoDeviceState = useDeviceManager(videoDeviceManagerRef.current);

  return videoDeviceState;
};
