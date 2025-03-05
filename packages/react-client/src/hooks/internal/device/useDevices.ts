import { type SetStateAction, useCallback, useMemo, useState } from "react";

interface UseDevicesProps {
  videoConstraints?: MediaTrackConstraints | boolean;
  audioConstraints?: MediaTrackConstraints | boolean;
}

const disableStream = (stream: MediaStream) => {
  stream.getTracks().forEach((track) => track.stop());
};

async function startDevice(
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

function getReplaceStreamAction(newStream: MediaStream | null): SetStateAction<MediaStream | null> {
  return (oldStream: MediaStream | null) => {
    if (oldStream) {
      disableStream(oldStream);
    }
    return newStream;
  };
}

function getStopStreamAction(): SetStateAction<MediaStream | null> {
  return (oldStream: MediaStream | null) => {
    if (oldStream) {
      disableStream(oldStream);
    }
    return null;
  };
}

export const useDevices = (props: UseDevicesProps) => {
  const [deviceList, setDeviceList] = useState<MediaDeviceInfo[]>([]);

  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  const getAccessToDevices = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: props.videoConstraints,
      audio: props.audioConstraints,
    });
    disableStream(stream);
    const devices = await navigator.mediaDevices.enumerateDevices();
    setDeviceList(devices);
  }, [props.videoConstraints, props.audioConstraints]);

  const videoDevices = useMemo(() => deviceList.filter(({ kind }) => kind === "videoinput"), [deviceList]);
  const audioDevices = useMemo(() => deviceList.filter(({ kind }) => kind === "audioinput"), [deviceList]);

  const activeAudioDevice = useMemo(
    () =>
      audioStream &&
      audioDevices.find((device) => device.deviceId === audioStream?.getAudioTracks()[0].getSettings().deviceId),
    [audioStream, audioDevices],
  );
  const activeVideoDevice = useMemo(
    () =>
      videoStream &&
      videoDevices.find((device) => device.deviceId === videoStream?.getVideoTracks()[0].getSettings().deviceId),
    [videoStream, videoDevices],
  );

  const startCamera = useCallback(
    async (deviceId?: string) => {
      const newStream = await startDevice("video", props.videoConstraints, deviceId);

      setVideoStream(getReplaceStreamAction(newStream));
    },
    [props.videoConstraints],
  );
  const startMicrophone = useCallback(
    async (deviceId?: string) => {
      const newStream = await startDevice("audio", props.audioConstraints, deviceId);
      setAudioStream(getReplaceStreamAction(newStream));
    },
    [props.audioConstraints],
  );

  const stopCamera = useCallback(() => {
    setVideoStream(getStopStreamAction());
  }, []);
  const stopMicrophone = useCallback(() => {
    setAudioStream(getStopStreamAction());
  }, []);

  return {
    deviceList,
    getAccessToDevices,
    videoDevices,
    audioDevices,
    activeVideoDevice,
    activeAudioDevice,
    startCamera,
    startMicrophone,
    stopCamera,
    stopMicrophone,
  };
};
