import type { SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";

import type { DeviceError, DeviceItem, TrackMiddleware } from "../../../types/public";
import { parseUserMediaError } from "../../../utils/errors";
import { useTrackMiddleware } from "../useTrackMiddleware";

type UseDeviceProps = {
  mediaStream: MediaStream | null;
  setStream: (action: SetStateAction<MediaStream | null>) => void;
  deviceError: DeviceError | null;
  setError: (action: SetStateAction<DeviceError | null>) => void;
  getInitialStream: () => Promise<MediaStream | null>;
  deviceType: "audio" | "video";
  allDevicesList: MediaDeviceInfo[];
  constraints?: MediaTrackConstraints | boolean;
  saveUsedDevice: (device: MediaDeviceInfo) => void;
};

export type DeviceApi = {
  startDevice: (deviceId?: string) => Promise<MediaStreamTrack | null>;
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

function getCertainTypeTracks(stream: MediaStream, type: "audio" | "video") {
  if (type === "audio") return stream.getAudioTracks();
  return stream.getVideoTracks();
}

function getTrackFromStream(stream: MediaStream, type: "audio" | "video") {
  return getCertainTypeTracks(stream, type)[0] ?? null;
}

function stopStream(stream: MediaStream, type: "audio" | "video") {
  getCertainTypeTracks(stream, type).forEach((track) => {
    track.enabled = false;
    track.stop();
  });
}

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
  if (constraints === false) {
    console.warn("Attempted to enable camera, but its disabled by a constraint");
    return null;
  }
  constraints = typeof constraints === "object" ? constraints : {};
  if (deviceId) {
    constraints.deviceId = { exact: deviceId };
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    [type]: constraints,
  });
  return stream;
}

export const useDevice = ({
  mediaStream,
  getInitialStream,
  deviceType,
  allDevicesList,
  setStream,
  constraints,
  saveUsedDevice,
  deviceError,
  setError,
}: UseDeviceProps): DeviceApi => {
  const rawTrack = useMemo(() => mediaStream && getTrackFromStream(mediaStream, deviceType), [mediaStream, deviceType]);

  const { processedTrack, applyMiddleware, currentMiddleware } = useTrackMiddleware(rawTrack);

  const currentTrack = useMemo(() => processedTrack ?? rawTrack, [rawTrack, processedTrack]);

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

  const startDevice = useCallback(
    async (deviceId?: string) => {
      let stream = await getInitialStream();

      const track = stream && getTrackFromStream(stream, deviceType);
      const isUsingDesiredDevice = !deviceId || deviceId === track?.getSettings().deviceId;

      if (track?.enabled && isUsingDesiredDevice) {
        return track;
      }

      try {
        stream = await getDeviceStream(deviceType, constraints, deviceId);

        setStream(getReplaceStreamAction(stream, deviceType));

        const retrievedTrack = stream && getTrackFromStream(stream, deviceType);
        const usedDevice = deviceList.find((device) => device.deviceId === retrievedTrack?.getSettings().deviceId);

        if (usedDevice) {
          saveUsedDevice(usedDevice);
        }

        return retrievedTrack;
      } catch (err) {
        const parsedError = parseUserMediaError(err);
        setError(parsedError);
        return null;
      }
    },
    [getInitialStream, deviceType, constraints, setStream, deviceList, saveUsedDevice, setError],
  );

  const stopDevice = useCallback(() => {
    setStream(getStopStreamAction(deviceType));
  }, [setStream, deviceType]);

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
