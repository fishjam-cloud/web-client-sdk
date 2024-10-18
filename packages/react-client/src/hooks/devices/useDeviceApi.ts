import { useMemo } from "react";
import type { TrackManager } from "../../types/internal";
import type { Device } from "../../types/public";
import type { DeviceManager } from "../../DeviceManager";
import { useDeviceManager } from "../deviceManagers/useDeviceManager";

type DeviceApiDependencies = {
  trackManager: TrackManager;
  deviceManager: DeviceManager;
};

export const useDeviceApi = ({ trackManager, deviceManager }: DeviceApiDependencies): Device => {
  const { deviceState, status, type } = useDeviceManager(deviceManager);
  const { currentTrack } = trackManager;

  const stream = useMemo(() => deviceState.media?.stream ?? null, [deviceState.media?.stream]);
  const currentMiddleware = deviceState.currentMiddleware ?? null;
  const isStreaming = Boolean(currentTrack?.stream);

  const track = useMemo(() => {
    if (type === "video") return stream?.getVideoTracks()[0] ?? null;
    return stream?.getAudioTracks()[0] ?? null;
  }, [stream, type]);

  const trackId = currentTrack?.trackId ?? null;
  const devices = useMemo(() => deviceState.devices ?? [], [deviceState.devices]);
  const activeDevice = deviceState.media?.deviceInfo ?? null;
  const isMuted = !deviceState.media?.enabled;
  const deviceError = deviceState.error ?? null;
  const isDeviceEnabled = Boolean(deviceState.media);

  return {
    ...trackManager,
    currentMiddleware,
    status,
    stream,
    devices,
    activeDevice,
    isStreaming,
    track,
    trackId,
    isMuted,
    deviceError,
    isDeviceEnabled,
  };
};
