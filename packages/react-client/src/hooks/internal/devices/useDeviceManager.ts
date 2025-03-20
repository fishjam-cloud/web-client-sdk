import type { SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";

import type { DeviceError, DeviceItem, TrackMiddleware } from "../../../types/public";
import { parseUserMediaError } from "../../../utils/errors";
import { getTrackFromStream, stopStream } from "../../../utils/track";
import { useTrackMiddleware } from "../useTrackMiddleware";

type DeviceManagerProps = {
  mediaStream: MediaStream | null;
  setMediaStream: (action: SetStateAction<MediaStream | null>) => void;
  deviceError: DeviceError | null;
  setDeviceError: (action: SetStateAction<DeviceError | null>) => void;
  getInitialStream: () => Promise<MediaStream | null>;
  deviceType: "audio" | "video";
  allDevicesList: MediaDeviceInfo[];
  constraints?: MediaTrackConstraints | boolean;
  saveUsedDevice: (device: MediaDeviceInfo) => void;
};

export type DeviceManager = {
  startDevice: (deviceId?: string) => Promise<[MediaStreamTrack, null] | [null, DeviceError]>;
  stopDevice: () => void;
  activeDevice: DeviceItem | null;
  deviceTrack: MediaStreamTrack | null;
  deviceList: DeviceItem[];
  deviceEnabled: boolean;
  enableDevice: () => void;
  disableDevice: () => void;
  currentMiddleware: TrackMiddleware;
  applyMiddleware: (middleware: TrackMiddleware) => MediaStreamTrack | null;
  deviceError: DeviceError | null;
};

function getReplaceStreamAction(
  newStream: MediaStream | null,
  deviceType: "audio" | "video",
): SetStateAction<MediaStream | null> {
  return (oldStream: MediaStream | null) => {
    if (oldStream) {
      stopStream(oldStream, deviceType);
    }
    return newStream;
  };
}

function getStopStreamAction(deviceType: "audio" | "video"): SetStateAction<MediaStream | null> {
  return (oldStream: MediaStream | null) => {
    if (oldStream) {
      stopStream(oldStream, deviceType);
    }
    return null;
  };
}

async function getDeviceStream(
  type: "audio" | "video",
  constraints: MediaTrackConstraints | boolean | undefined,
  deviceId?: string,
) {
  constraints = typeof constraints === "object" ? constraints : {};
  if (deviceId) {
    constraints.deviceId = { exact: deviceId };
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    [type]: constraints,
  });
  return stream;
}

export const useDeviceManager = ({
  mediaStream,
  getInitialStream,
  deviceType,
  allDevicesList,
  setMediaStream,
  constraints,
  saveUsedDevice,
  deviceError,
  setDeviceError,
}: DeviceManagerProps): DeviceManager => {
  const rawTrack = useMemo(() => mediaStream && getTrackFromStream(mediaStream, deviceType), [mediaStream, deviceType]);

  const { processedTrack, applyMiddleware, currentMiddleware } = useTrackMiddleware(rawTrack);

  const currentTrack = processedTrack ?? rawTrack;

  const deviceList = useMemo(
    () => allDevicesList.filter(({ kind }) => kind === `${deviceType}input`),
    [allDevicesList, deviceType],
  );

  const activeDevice = useMemo(() => {
    const currentDevice =
      mediaStream &&
      deviceList.find(
        (device) => device.deviceId === getTrackFromStream(mediaStream, deviceType)?.getSettings().deviceId,
      );
    if (!currentDevice) return null;
    return { label: currentDevice.label, deviceId: currentDevice.deviceId };
  }, [mediaStream, deviceList, deviceType]);

  const [deviceEnabled, setDeviceEnabled] = useState(true);

  const startDevice: DeviceManager["startDevice"] = useCallback(
    async (deviceId) => {
      const initialStream = await getInitialStream();

      const track = initialStream && getTrackFromStream(initialStream, deviceType);
      const isUsingDesiredDevice = !deviceId || deviceId === track?.getSettings().deviceId;

      if (track?.enabled && isUsingDesiredDevice) {
        return [track, null];
      }

      try {
        const stream = await getDeviceStream(deviceType, constraints, deviceId);

        setMediaStream(getReplaceStreamAction(stream, deviceType));

        const retrievedTrack = stream && getTrackFromStream(stream, deviceType);

        const usedDevice = deviceList.find((device) => device.deviceId === retrievedTrack?.getSettings().deviceId);

        if (usedDevice) {
          saveUsedDevice(usedDevice);
        }

        return [retrievedTrack, null];
      } catch (err) {
        const parsedError = parseUserMediaError(err);
        setDeviceError(parsedError);
        return [null, parsedError];
      }
    },
    [getInitialStream, deviceType, constraints, setMediaStream, deviceList, saveUsedDevice, setDeviceError],
  );

  const stopDevice = useCallback(() => {
    setMediaStream(getStopStreamAction(deviceType));
  }, [setMediaStream, deviceType]);

  const enableDevice = useCallback(() => {
    if (!currentTrack) return;
    currentTrack.enabled = true;
    setDeviceEnabled(true);
  }, [currentTrack]);

  const disableDevice = useCallback(() => {
    if (!currentTrack) return;
    currentTrack.enabled = false;
    setDeviceEnabled(false);
  }, [currentTrack]);

  return {
    startDevice,
    stopDevice,
    activeDevice,
    deviceTrack: processedTrack ?? rawTrack,
    deviceList,
    enableDevice,
    disableDevice,
    deviceEnabled,
    currentMiddleware,
    applyMiddleware,
    deviceError,
  };
};
