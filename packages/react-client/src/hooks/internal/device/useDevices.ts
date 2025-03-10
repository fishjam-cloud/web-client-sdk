import { type SetStateAction, useCallback, useMemo, useRef, useState } from "react";

import { correctDevicesOnSafari, getAvailableMedia } from "../../../devices/mediaInitializer";

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
  startDevice: (deviceId?: string) => Promise<MediaStreamTrack | null>;
  stopDevice: () => void;
  active: MediaDeviceInfo | null | undefined;
  deviceTrack: MediaStreamTrack | null;
  devices: MediaDeviceInfo[];
  enabled: boolean;
  enableDevice: () => void;
  disableDevice: () => void;
};

export const useDevices = (props: UseDevicesProps) => {
  const [deviceList, setDeviceList] = useState<MediaDeviceInfo[]>([]);

  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);

  const initializationRef = useRef<Promise<MediaStream> | null>(null);

  const getAccessToDevices = useCallback(async () => {
    const constraints = {
      video: props.videoConstraints,
      audio: props.audioConstraints,
    };
    let [stream, errors] = await getAvailableMedia(constraints);
    const devices = await navigator.mediaDevices.enumerateDevices();
    setDeviceList(devices);
    if (stream) {
      [stream, errors] = await correctDevicesOnSafari(stream, errors, devices, constraints, {
        video: null,
        audio: null,
      });
    }
    setVideoStream(stream);
    setAudioStream(stream);
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

  const getInitialStream = useCallback(async () => {
    return await initializationRef.current;
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      let stream = await getInitialStream();

      if (stream) {
        const track = stream.getVideoTracks()[0];
        const isUsingDesiredDevice = !deviceId || deviceId === track?.getSettings().deviceId;

        if (track && isUsingDesiredDevice) {
          setVideoStream(getReplaceStreamAction(stream));
          return track;
        }
      } else {
        stream = await startDevice("video", props.videoConstraints, deviceId);
      }

      setVideoStream(getReplaceStreamAction(stream));
      return stream?.getVideoTracks()[0] ?? null;
    },
    [getInitialStream, props.videoConstraints],
  );
  const startMicrophone = useCallback(
    async (deviceId?: string) => {
      let stream = await getInitialStream();

      if (stream) {
        const track = stream.getAudioTracks()[0];
        const isUsingDesiredDevice = !deviceId || deviceId === track?.getSettings().deviceId;

        if (track && isUsingDesiredDevice) {
          setAudioStream(getReplaceStreamAction(stream));
          return track;
        }
      } else {
        stream = await startDevice("audio", props.videoConstraints, deviceId);
      }

      setAudioStream(getReplaceStreamAction(stream));
      return stream?.getAudioTracks()[0] ?? null;
    },
    [getInitialStream, props.videoConstraints],
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
      startDevice: startCamera,
      stopDevice: stopCamera,
      active: activeVideoDevice,
      deviceTrack: videoStream?.getVideoTracks()[0] ?? null,
      devices: videoDevices,
      enableDevice: enableCamera,
      disableDevice: disableCamera,
      enabled: cameraEnabled,
    }),
    [activeVideoDevice, cameraEnabled, disableCamera, enableCamera, startCamera, stopCamera, videoDevices, videoStream],
  );

  const microphone = useMemo(
    (): NewDeviceApi => ({
      startDevice: startMicrophone,
      stopDevice: stopMicrophone,
      active: activeAudioDevice,
      deviceTrack: audioStream?.getAudioTracks()[0] ?? null,
      devices: audioDevices,
      enableDevice: enableMicrophone,
      disableDevice: disableMicrophone,
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
