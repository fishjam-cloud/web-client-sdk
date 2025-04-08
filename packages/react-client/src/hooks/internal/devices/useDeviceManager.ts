import type { SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";

import type { DeviceError, DeviceItem, TrackMiddleware } from "../../../types/public";
import { parseUserMediaError } from "../../../utils/errors";
import { getTrackFromStream, stopStream } from "../../../utils/track";
import { useTrackMiddleware } from "../useTrackMiddleware";
import { useHandleTrackEnd } from "./useHandleTrackEnd";

type DeviceManagerProps = {
  mediaStream: MediaStream | null;
  setMediaStream: (action: SetStateAction<MediaStream | null>) => void;
  deviceError: DeviceError | null;
  setDeviceError: (action: SetStateAction<DeviceError | null>) => void;
  getInitialStream: () => Promise<MediaStream | null>;
  deviceType: "audio" | "video";
  allDevicesList: MediaDeviceInfo[];
  constraints?: MediaTrackConstraints | boolean;
  setSelectedDevice: (device: MediaDeviceInfo) => void;
  selectedDevice: MediaDeviceInfo | null;
};

export type DeviceManager = {
  startDevice: (deviceId?: string | null) => Promise<[MediaStreamTrack, null] | [null, DeviceError]>;
  stopDevice: () => void;
  selectDevice: (deviceId: string) => Promise<[MediaStreamTrack, null] | [null, DeviceError]> | undefined;
  activeDevice: DeviceItem | null;
  deviceTrack: MediaStreamTrack | null;
  deviceList: DeviceItem[];
  deviceEnabled: boolean;
  enableDevice: () => void;
  disableDevice: () => void;
  currentMiddleware: TrackMiddleware;
  applyMiddleware: (middleware: TrackMiddleware) => MediaStreamTrack | null;
  deviceError: DeviceError | null;
  selectedDevice: MediaDeviceInfo | null;
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
  deviceId: string | null,
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
  setMediaStream,
  getInitialStream,
  deviceType,
  constraints,
  allDevicesList,
  setSelectedDevice,
  deviceError,
  setDeviceError,
  selectedDevice,
}: DeviceManagerProps): DeviceManager => {
  const rawTrack = useMemo(() => mediaStream && getTrackFromStream(mediaStream, deviceType), [mediaStream, deviceType]);

  const clearStream = useCallback(() => {
    setMediaStream(null);
  }, [setMediaStream]);

  useHandleTrackEnd(rawTrack, clearStream);

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

  const setSelectedDeviceId = useCallback(
    (deviceId: string) => {
      const device = deviceList.find((d) => d.deviceId === deviceId);
      if (!device) return;
      setSelectedDevice(device);
    },
    [deviceList, setSelectedDevice],
  );

  const startDevice: DeviceManager["startDevice"] = useCallback(
    async (deviceId = selectedDevice?.deviceId) => {
      const initialStream = await getInitialStream();

      const track = initialStream && getTrackFromStream(initialStream, deviceType);
      const isUsingDesiredDevice = !deviceId || deviceId === track?.getSettings().deviceId;

      if (track?.enabled && isUsingDesiredDevice) {
        return [track, null];
      }

      try {
        const stream = await getDeviceStream(deviceType, constraints, deviceId ?? null);

        setMediaStream(getReplaceStreamAction(stream, deviceType));

        const retrievedTrack = stream && getTrackFromStream(stream, deviceType);

        const retrievedTrackDeviceId = retrievedTrack.getSettings().deviceId;

        if (retrievedTrackDeviceId) {
          setSelectedDeviceId(retrievedTrackDeviceId);
        }

        if (retrievedTrack && !deviceEnabled) {
          retrievedTrack.enabled = false;
        }

        return [retrievedTrack, null];
      } catch (err) {
        const parsedError = parseUserMediaError(err);
        setDeviceError(parsedError);
        return [null, parsedError];
      }
    },
    [
      selectedDevice?.deviceId,
      getInitialStream,
      deviceType,
      constraints,
      setMediaStream,
      deviceEnabled,
      setSelectedDeviceId,
      setDeviceError,
    ],
  );

  const selectDevice = useCallback(
    (deviceId: string) => {
      if (currentTrack) {
        return startDevice(deviceId);
      } else {
        setSelectedDeviceId(deviceId);
      }
    },
    [currentTrack, setSelectedDeviceId, startDevice],
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
    selectDevice,
    activeDevice,
    deviceTrack: processedTrack ?? rawTrack,
    deviceList,
    enableDevice,
    disableDevice,
    deviceEnabled,
    currentMiddleware,
    applyMiddleware,
    deviceError,
    selectedDevice,
  };
};
