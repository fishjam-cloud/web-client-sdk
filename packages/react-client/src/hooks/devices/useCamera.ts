import type { DeviceError, DeviceItem, TrackMiddleware } from "../../types/public";
import { useDeviceApi } from "../internal/device/useDeviceApi";
import { useFishjamContext } from "../internal/useFishjamContext";

/**
 * @category Devices
 */
export type UseCameraResult = {
  /**
   * Toggles current camera on/off
   */
  toggleCamera: () => void;
  /**
   * Selects the camera device
   */
  selectCamera: (deviceId: string) => void;
  /**
   * Indicates which camera is now turned on and streaming
   */
  activeCamera: DeviceItem | null;
  /**
   * Indicates whether the microphone is streaming video
   */
  isCameraOn: boolean;
  /**
   * The MediaStream object containing the current stream
   */
  cameraStream: MediaStream | null;
  /**
   * The currently set camera middleware function
   */
  currentCameraMiddleware: TrackMiddleware;
  /**
   * Sets the camera middleware
   */
  setCameraTrackMiddleware: (middleware: TrackMiddleware | null) => Promise<void>;
  /**
   * List of available camera devices
   */
  cameraDevices: DeviceItem[];
  /**
   * Possible error thrown while setting up the camera
   */
  cameraDeviceError: DeviceError | null;
};

/**
 *
 * @category Devices
 */
export function useCamera(): UseCameraResult {
  const { videoTrackManager, videoDeviceManagerRef } = useFishjamContext();
  const deviceApi = useDeviceApi({ deviceManager: videoDeviceManagerRef.current });

  return {
    toggleCamera: videoTrackManager.toggleDevice,
    selectCamera: videoTrackManager.selectDevice,
    activeCamera: deviceApi.activeDevice,
    isCameraOn: !!deviceApi.mediaStream,
    cameraStream: deviceApi.mediaStream,
    currentCameraMiddleware: deviceApi.currentMiddleware,
    setCameraTrackMiddleware: videoTrackManager.setTrackMiddleware,
    cameraDevices: deviceApi.devices,
    cameraDeviceError: deviceApi.deviceError,
  };
}
