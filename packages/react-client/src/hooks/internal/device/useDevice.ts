import type { SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";

import type { DeviceItem, TrackMiddleware } from "../../../types/public";
import { useTrackMiddleware } from "../useTrackMiddleware";

type UseDeviceProps = {
  mediaStream: MediaStream | null;
  setStream: (action: SetStateAction<MediaStream | null>) => void;
  getInitialStream: () => Promise<MediaStream | null>;
  deviceType: "audio" | "video";
  deviceList: MediaDeviceInfo[];
  constraints?: MediaTrackConstraints | boolean;
};

export type NewDeviceApi = {
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
};

function getTrackFromStream(stream: MediaStream | null, type: "audio" | "video") {
  if (type === "audio") return stream?.getAudioTracks()[0] ?? null;
  return stream?.getVideoTracks()[0] ?? null;
}

function stopStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}

function getReplaceStreamAction(newStream: MediaStream | null): SetStateAction<MediaStream | null> {
  return (oldStream: MediaStream | null) => {
    if (oldStream) {
      stopStream(oldStream);
    }
    return newStream;
  };
}

function getStopStreamAction(): SetStateAction<MediaStream | null> {
  return (oldStream: MediaStream | null) => {
    if (oldStream) {
      stopStream(oldStream);
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
  deviceList,
  setStream,
  constraints,
}: UseDeviceProps): NewDeviceApi => {
  const rawTrack = useMemo(() => getTrackFromStream(mediaStream, deviceType), [mediaStream, deviceType]);

  const { processedTrack, applyMiddleware, currentMiddleware } = useTrackMiddleware(rawTrack);

  const currentTrack = useMemo(() => processedTrack ?? rawTrack, [rawTrack, processedTrack]);

  const currentTypeDevices = useMemo(
    () => deviceList.filter(({ kind }) => kind === `${deviceType}input`),
    [deviceList, deviceType],
  );

  const activeDevice = useMemo(() => {
    const currentDevice =
      mediaStream &&
      currentTypeDevices.find((device) => device.deviceId === mediaStream?.getVideoTracks()[0].getSettings().deviceId);
    if (!currentDevice) return null;
    return { label: currentDevice.label, deviceId: currentDevice.deviceId };
  }, [mediaStream, currentTypeDevices]);

  const [deviceEnabled, setDeviceEnabled] = useState(true);

  const startDevice = useCallback(
    async (deviceId?: string) => {
      let stream = await getInitialStream();

      if (stream) {
        const track = getTrackFromStream(stream, deviceType);
        const isUsingDesiredDevice = !deviceId || deviceId === track?.getSettings().deviceId;

        if (track && isUsingDesiredDevice) {
          return track;
        }
      } else {
        stream = await getDeviceStream(deviceType, constraints, deviceId);
      }

      setStream(getReplaceStreamAction(stream));
      return getTrackFromStream(stream, deviceType) ?? null;
    },
    [getInitialStream, setStream, deviceType, constraints],
  );

  const stopDevice = useCallback(() => {
    setStream(getStopStreamAction());
  }, [setStream]);

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

  const deviceTrack = useMemo(() => getTrackFromStream(mediaStream, deviceType) ?? null, [mediaStream, deviceType]);

  return {
    startDevice,
    stopDevice,
    activeDevice,
    deviceTrack,
    deviceList,
    enableDevice,
    disableDevice,
    deviceEnabled,
    currentMiddleware,
    applyMiddleware,
  };
};
