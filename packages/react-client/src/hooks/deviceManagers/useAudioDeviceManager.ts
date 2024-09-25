import { useFishjamContext } from "../useFishjamContext";
import { useDeviceManager } from "./useDeviceManager";
/**
 *
 * @category Devices
 */
export const useAudioDeviceManager = () => {
  const { audioDeviceManagerRef } = useFishjamContext();
  const audioDeviceState = useDeviceManager(audioDeviceManagerRef.current);

  return audioDeviceState;
};
