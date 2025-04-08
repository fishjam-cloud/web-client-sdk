import { useContext, useMemo } from "react";

import { CameraContext } from "../../contexts/camera";

/**
 * This hook can toggle camera on/off, change camera, provides current camera and other.
 * @category Devices
 */
export function useCamera() {
  const cameraCtx = useContext(CameraContext);
  if (!cameraCtx) throw Error("useCamera must be used within CameraProvider");

  const { videoTrackManager, cameraManager } = cameraCtx;

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
     * @deprecated Use `currentCamera` and `isCameraOn` instead
     * Indicates which camera is now turned on and streaming
     */
    activeCamera: cameraManager.activeDevice,
    /**
     * Indicates which camera is now selected
     */
    currentCamera: cameraManager.selectedDevice,
    /**
     * Indicates whether the camera is streaming video
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
    cameraDevices: cameraManager.deviceList,
    /**
     * Possible error thrown while setting up the camera
     */
    cameraDeviceError: cameraManager.deviceError,
  };
}
