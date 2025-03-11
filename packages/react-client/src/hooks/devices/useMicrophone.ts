import { useMemo } from "react";

import { useMicrophoneContext } from "../internal/contexts/useMicrophoneContext";

/**
 * Manage microphone
 * @category Devices
 */
export function useMicrophone() {
  const { audioTrackManager, microphone } = useMicrophoneContext();

  const microphoneStream = useMemo(() => {
    const track = audioTrackManager.deviceTrack;
    if (!track) return null;
    return new MediaStream([track]);
  }, [audioTrackManager.deviceTrack]);

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
    activeMicrophone: microphone.activeDevice,
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
    currentMicrophoneMiddleware: audioTrackManager.currentMiddleware,
    /**
     * Sets the microphone middleware
     */
    setMicrophoneTrackMiddleware: audioTrackManager.setTrackMiddleware,
    /**
     * List of available microphone devices
     */
    microphoneDevices: microphone.deviceList,
    /**
     * Possible error thrown while setting up the microphone
     */
    microphoneDeviceError: null,
  };
}
