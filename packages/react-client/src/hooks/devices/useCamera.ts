import type { CameraApi } from "../../types/public";
import { useDeviceApi } from "../internal/device/useDeviceApi";
import { useFishjamContext } from "../internal/useFishjamContext";

/**
 *
 * @category Devices
 */
export function useCamera(): CameraApi {
  const { videoTrackManager, videoDeviceManagerRef } = useFishjamContext();
  const deviceApi = useDeviceApi({ deviceManager: videoDeviceManagerRef.current });

  return {
    /** Toggles current camera on/off */
    toggleCamera: videoTrackManager.toggleDevice,
    /** Selects the camera device  */
    selectCamera: videoTrackManager.selectDevice,
    /**
     * Indicates which camera is now turned on and streaming
     */
    activeCamera: deviceApi.activeDevice,
    /**
     * Indicates whether the microphone is streaming video
     */
    isCameraOn: !!deviceApi.mediaStream,
    /**
     * The MediaStream object containing the current stream
     */
    cameraStream: deviceApi.mediaStream,
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
    cameraDevices: deviceApi.devices,
    /**
     * Possible error thrown while setting up the camera
     */
    cameraDeviceError: deviceApi.deviceError,
  };
}
