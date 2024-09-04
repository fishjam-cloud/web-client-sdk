import { useFishjamContext } from "../useFishjamContext";
import { useDeviceManager } from "./useDeviceManager";

export const useAudioDeviceManager = () => {
  const { audioDeviceManagerRef } = useFishjamContext();
  const audioDeviceState = useDeviceManager(audioDeviceManagerRef.current);

  return audioDeviceState;
};
