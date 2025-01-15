import type { DeviceError, DeviceItem, TrackMiddleware } from "../../types/public";
import { useDeviceApi } from "../internal/device/useDeviceApi";
import { useFishjamContext } from "../internal/useFishjamContext";

/**
 * @category Devices
 */
export type UseMicrophoneResult = {
  /** Toggles current microphone on/off */
  toggleMicrophone: () => void;
  /** Mutes/unmutes the microphone */
  toggleMicrophoneMute: () => void;
  /** Selects the microphone device */
  selectMicrophone: (deviceId: string) => void;
  /**
   * Indicates which microphone is now turned on and streaming audio
   */
  activeMicrophone: DeviceItem | null;
  /**
   * Indicates whether the microphone is streaming audio
   */
  isMicrophoneOn: boolean;
  /**
   * Indicates whether the microphone is muted
   */
  isMicrophoneMuted: boolean;
  /**
   * The MediaStream object containing the current audio stream
   */
  microphoneStream: MediaStream | null;
  /**
   * The currently set microphone middleware function
   */
  currentMicrophoneMiddleware: TrackMiddleware;
  /**
   * Sets the microphone middleware
   */
  setMicrophoneTrackMiddleware: (middleware: TrackMiddleware | null) => Promise<void>;
  /**
   * List of available microphone devices
   */
  microphoneDevices: DeviceItem[];
  /**
   * Possible error thrown while setting up the microphone
   */
  microphoneDeviceError: DeviceError | null;
};

/**
 *
 * @category Devices
 */
export function useMicrophone(): UseMicrophoneResult {
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
