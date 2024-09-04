import { useFishjamContext } from "../useFishjamContext";
import { useDeviceManager } from "./useDeviceManager";

export const useVideoDeviceManager = () => {
  const { videoDeviceManagerRef } = useFishjamContext();
  const videoDeviceState = useDeviceManager(videoDeviceManagerRef.current);

  return videoDeviceState;
};
