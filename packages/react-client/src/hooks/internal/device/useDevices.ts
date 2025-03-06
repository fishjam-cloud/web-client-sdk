import { type SetStateAction, useCallback, useMemo, useState } from "react";

interface UseDevicesProps {
  videoConstraints?: MediaTrackConstraints | boolean;
  audioConstraints?: MediaTrackConstraints | boolean;
}

function stopStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}

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

export type NewDeviceApi = {
  start: (deviceId?: string) => Promise<MediaStream | null>;
  stop: () => void;
  active: MediaDeviceInfo | null | undefined;
  stream: MediaStream | null;
  devices: MediaDeviceInfo[];
  enabled: boolean;
  enable: () => void;
  disable: () => void;
};

export const useDevices = (props: UseDevicesProps) => {
  const [deviceList, setDeviceList] = useState<MediaDeviceInfo[]>([]);

  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);

  const getAccessToDevices = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: props.videoConstraints,
      audio: props.audioConstraints,
    });
    stopStream(stream);
    const devices = await navigator.mediaDevices.enumerateDevices();
    console.log(devices);
    setDeviceList(devices);
  }, [props.videoConstraints, props.audioConstraints]);

  const videoDevices = useMemo(() => deviceList.filter(({ kind }) => kind === "videoinput"), [deviceList]);
  const audioDevices = useMemo(() => deviceList.filter(({ kind }) => kind === "audioinput"), [deviceList]);

  const activeVideoDevice = useMemo(
    () =>
      videoStream &&
      videoDevices.find((device) => device.deviceId === videoStream?.getVideoTracks()[0].getSettings().deviceId),
    [videoStream, videoDevices],
  );
  const activeAudioDevice = useMemo(
    () =>
      audioStream &&
      audioDevices.find((device) => device.deviceId === audioStream?.getAudioTracks()[0].getSettings().deviceId),
    [audioStream, audioDevices],
  );

  const startCamera = useCallback(
    async (deviceId?: string) => {
      const newStream = await startDevice("video", props.videoConstraints, deviceId);

      setVideoStream(getReplaceStreamAction(newStream));
      return newStream;
    },
    [props.videoConstraints],
  );
  const startMicrophone = useCallback(
    async (deviceId?: string) => {
      const newStream = await startDevice("audio", props.audioConstraints, deviceId);
      setAudioStream(getReplaceStreamAction(newStream));
      return newStream;
    },
    [props.audioConstraints],
  );

  const stopCamera = useCallback(() => {
    setVideoStream(getStopStreamAction());
  }, []);
  const stopMicrophone = useCallback(() => {
    setAudioStream(getStopStreamAction());
  }, []);

  const enableCamera = useCallback(() => {
    if (!videoStream) return;
    const track = videoStream.getVideoTracks()[0];
    track.enabled = true;
    setCameraEnabled(true);
  }, [videoStream]);
  const enableMicrophone = useCallback(() => {
    if (!audioStream) return;
    const track = audioStream.getAudioTracks()[0];
    track.enabled = true;
    setMicrophoneEnabled(true);
  }, [audioStream]);

  const disableCamera = useCallback(() => {
    if (!videoStream) return;
    const track = videoStream.getVideoTracks()[0];
    track.enabled = false;
    setCameraEnabled(false);
  }, [videoStream]);
  const disableMicrophone = useCallback(() => {
    if (!audioStream) return;
    const track = audioStream.getAudioTracks()[0];
    track.enabled = false;
    setMicrophoneEnabled(false);
  }, [audioStream]);

  const camera = useMemo(
    (): NewDeviceApi => ({
      start: startCamera,
      stop: stopCamera,
      active: activeVideoDevice,
      stream: videoStream,
      devices: videoDevices,
      enable: enableCamera,
      disable: disableCamera,
      enabled: cameraEnabled,
    }),
    [activeVideoDevice, cameraEnabled, disableCamera, enableCamera, startCamera, stopCamera, videoDevices, videoStream],
  );

  const microphone = useMemo(
    (): NewDeviceApi => ({
      start: startMicrophone,
      stop: stopMicrophone,
      active: activeAudioDevice,
      stream: audioStream,
      devices: audioDevices,
      enable: enableMicrophone,
      disable: disableMicrophone,
      enabled: microphoneEnabled,
    }),
    [
      activeAudioDevice,
      audioDevices,
      audioStream,
      disableMicrophone,
      enableMicrophone,
      microphoneEnabled,
      startMicrophone,
      stopMicrophone,
    ],
  );

  return {
    deviceList,
    getAccessToDevices,
    camera,
    microphone,
  };
};
