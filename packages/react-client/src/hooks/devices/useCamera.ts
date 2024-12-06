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
