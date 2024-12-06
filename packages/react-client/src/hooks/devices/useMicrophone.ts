import type { MicrophoneApi } from "../../types/public";
import { useDeviceApi } from "../internal/device/useDeviceApi";
import { useFishjamContext } from "../internal/useFishjamContext";

/**
 *
 * @category Devices
 */
export function useMicrophone(): MicrophoneApi {
  const { audioTrackManager, audioDeviceManagerRef } = useFishjamContext();
  const deviceApi = useDeviceApi({ deviceManager: audioDeviceManagerRef.current });

  return {
    toggleMicrophone: audioTrackManager.toggleDevice,
    toggleMicrophoneMute: audioTrackManager.toggleMute,
    selectMicrophone: audioTrackManager.selectDevice,
    activeMicrophone: deviceApi.activeDevice,
    isMicrophoneOn: !!deviceApi.mediaStream,
    isMicrophoneMuted: audioTrackManager.paused,
    microphoneStream: deviceApi.mediaStream,
    currentMicrophoneMiddleware: deviceApi.currentMiddleware,
    setMicrophoneTrackMiddleware: audioTrackManager.setTrackMiddleware,
    microphoneDevices: deviceApi.devices,
    microphoneDeviceError: deviceApi.deviceError,
  };
}
