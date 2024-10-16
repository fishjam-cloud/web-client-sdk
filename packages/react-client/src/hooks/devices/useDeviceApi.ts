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

  const stream = useMemo(
    () => currentTrack?.stream ?? deviceState.media?.stream ?? null,
    [currentTrack?.stream, deviceState.media?.stream],
  );
  const currentMiddleware = deviceState.currentMiddleware ?? null;
  const isStreaming = Boolean(currentTrack?.stream);

  const track = useMemo(() => {
    if (type === "video") return stream?.getVideoTracks()[0] ?? null;
    return stream?.getAudioTracks()[0] ?? null;
  }, [stream, type]);

  const trackId = currentTrack?.trackId ?? null;
  const devices = useMemo(() => deviceState.devices ?? [], [deviceState.devices]);
  const activeDevice = useMemo(() => deviceState.media?.deviceInfo ?? null, [deviceState.media?.deviceInfo]);

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
  };
};
