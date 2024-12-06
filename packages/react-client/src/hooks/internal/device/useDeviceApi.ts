import { useMemo } from "react";

import type { DeviceManager } from "../../../devices/DeviceManager";
import type { Device, DeviceItem } from "../../../types/public";
import { useDeviceManager } from "./useDeviceManager";

type DeviceApiDependencies = {
  deviceManager: DeviceManager;
};

export const useDeviceApi = ({ deviceManager }: DeviceApiDependencies): Device => {
  const { deviceState, deviceType, deviceStatus } = useDeviceManager(deviceManager);

  const mediaStream = useMemo(() => deviceState.media?.stream ?? null, [deviceState.media?.stream]);
  const currentMiddleware = deviceState.currentMiddleware ?? null;

  const mediaStreamTrack = useMemo(() => {
    if (deviceType === "video") return mediaStream?.getVideoTracks()[0] ?? null;
    return mediaStream?.getAudioTracks()[0] ?? null;
  }, [mediaStream, deviceType]);

  const devices = useMemo(
    () => deviceState.devices?.map<DeviceItem>(({ deviceId, label }) => ({ deviceId, label })) ?? [],
    [deviceState.devices],
  );
  const activeDevice = deviceState.media?.deviceInfo
    ? { deviceId: deviceState.media.deviceInfo.deviceId, label: deviceState.media.deviceInfo.label }
    : null;
  const isMuted = !deviceState.media?.enabled;
  const deviceError = deviceState.error ?? null;

  return {
    mediaStream,
    currentMiddleware,
    deviceStatus,
    devices,
    deviceError,
    activeDevice,
    isMuted,
    mediaStreamTrack,
  };
};
