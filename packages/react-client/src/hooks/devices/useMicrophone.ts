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
    /** Toggles current microphone on/off */
    toggleMicrophone: audioTrackManager.toggleDevice,
    /** Mutes/unmutes the microphone */
    toggleMicrophoneMute: audioTrackManager.toggleMute,
    /** Selects the microphone device */
    selectMicrophone: audioTrackManager.selectDevice,
    /**
     * Indicates which microphone is now turned on and streaming audio
     */
    activeMicrophone: deviceApi.activeDevice,
    /**
     * Indicates whether the microphone is streaming audio
     */
    isMicrophoneOn: !!deviceApi.mediaStream,
    /**
     * Indicates whether the microphone is muted
     */
    isMicrophoneMuted: audioTrackManager.paused,
    /**
     * The MediaStream object containing the current audio stream
     */
    microphoneStream: deviceApi.mediaStream,
    /**
     * The currently set microphone middleware function
     */
    currentMicrophoneMiddleware: deviceApi.currentMiddleware,
    /**
     * Sets the microphone middleware
     */
    setMicrophoneTrackMiddleware: audioTrackManager.setTrackMiddleware,
    /**
     * List of available microphone devices
     */
    microphoneDevices: deviceApi.devices,
    /**
     * Possible error thrown while setting up the microphone
     */
    microphoneDeviceError: deviceApi.deviceError,
  };
}
