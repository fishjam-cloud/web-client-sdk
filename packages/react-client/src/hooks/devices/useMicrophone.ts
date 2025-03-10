import { useMemo } from "react";

import { useDeviceApi } from "../internal/device/useDeviceApi";
import { useFishjamContext } from "../internal/useFishjamContext";

/**
 * Manage microphone
 * @category Devices
 */
export function useMicrophone() {
  const { audioTrackManager, audioDeviceManagerRef, deviceList } = useFishjamContext();
  const deviceApi = useDeviceApi({ deviceManager: audioDeviceManagerRef.current });

  const microphoneDevices = useMemo(() => deviceList.filter(({ kind }) => kind === "videoinput"), [deviceList]);

  const microphoneStream = useMemo(
    () => audioTrackManager.track && new MediaStream([audioTrackManager.track]),
    [audioTrackManager.track],
  );

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
    isMicrophoneOn: !!microphoneStream,
    /**
     * Indicates whether the microphone is muted
     */
    isMicrophoneMuted: audioTrackManager.paused,
    /**
     * The MediaStream object containing the current audio stream
     */
    microphoneStream,
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
    microphoneDevices,
    /**
     * Possible error thrown while setting up the microphone
     */
    microphoneDeviceError: deviceApi.deviceError,
  };
}
