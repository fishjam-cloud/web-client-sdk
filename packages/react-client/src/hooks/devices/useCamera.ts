import { useMemo } from "react";

import { useCameraContext } from "../internal/contexts/useCameraContext";

/**
 * This hook can toggle camera on/off, change camera, provides current camera and other.
 * @category Devices
 */
export function useCamera() {
  const { videoTrackManager, camera } = useCameraContext();

  const cameraStream = useMemo(() => {
    const track = videoTrackManager.deviceTrack;
    if (!track) return null;
    return new MediaStream([track]);
  }, [videoTrackManager.deviceTrack]);

  return {
    /**
     * Toggles current camera on/off
     */
    toggleCamera: videoTrackManager.toggleDevice,
    /**
     * Selects the camera device
     */
    selectCamera: videoTrackManager.selectDevice,
    /**
     * Indicates which camera is now turned on and streaming
     */
    activeCamera: camera.activeDevice,
    /**
     * Indicates whether the microphone is streaming video
     */
    isCameraOn: !!cameraStream,
    /**
     * The MediaStream object containing the current stream
     */
    cameraStream,
    /**
     * The currently set camera middleware function
     */
    currentCameraMiddleware: videoTrackManager.currentMiddleware,
    /**
     * Sets the camera middleware
     */
    setCameraTrackMiddleware: videoTrackManager.setTrackMiddleware,
    /**
     * List of available camera devices
     */
    cameraDevices: camera.deviceList,
    /**
     * Possible error thrown while setting up the camera
     */
    cameraDeviceError: null,
  };
}
