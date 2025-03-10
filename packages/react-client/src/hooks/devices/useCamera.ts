import { useMemo } from "react";

import { useDeviceApi } from "../internal/device/useDeviceApi";
import { useFishjamContext } from "../internal/useFishjamContext";

/**
 * This hook can toggle camera on/off, change camera, provides current camera and other.
 * @category Devices
 */
export function useCamera() {
  const { videoTrackManager, videoDeviceManagerRef, deviceList } = useFishjamContext();
  const deviceApi = useDeviceApi({ deviceManager: videoDeviceManagerRef.current });

  const cameraDevices = useMemo(() => deviceList.filter(({ kind }) => kind === "videoinput"), [deviceList]);

  const cameraStream = useMemo(
    () => videoTrackManager.track && new MediaStream([videoTrackManager.track]),
    [videoTrackManager.track],
  );
  const activeCamera = useMemo(
    () => deviceList.find(({ deviceId }) => deviceId === videoTrackManager.track?.getSettings().deviceId),
    [videoTrackManager.track, deviceList],
  );

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
    activeCamera,
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
    currentCameraMiddleware: deviceApi.currentMiddleware,
    /**
     * Sets the camera middleware
     */
    setCameraTrackMiddleware: videoTrackManager.setTrackMiddleware,
    /**
     * List of available camera devices
     */
    cameraDevices,
    /**
     * Possible error thrown while setting up the camera
     */
    cameraDeviceError: null,
  };
}
