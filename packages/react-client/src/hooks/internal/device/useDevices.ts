import { useCallback, useRef, useState } from "react";

import { correctDevicesOnSafari, getAvailableMedia } from "../../../devices/mediaInitializer";
import type { AudioVideo } from "../../../types/internal";
import type { DeviceError } from "../../../types/public";
import { useDevice } from "./useDevice";

interface UseDevicesProps {
  videoConstraints?: MediaTrackConstraints | boolean;
  audioConstraints?: MediaTrackConstraints | boolean;
}

type InitializeDevicesResult = { stream: MediaStream | null; errors: AudioVideo<DeviceError | null> | null };

export const useDevices = (props: UseDevicesProps) => {
  const [deviceList, setDeviceList] = useState<MediaDeviceInfo[]>([]);

  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  const initializationRef = useRef<Promise<InitializeDevicesResult> | null>(null);

  const initializeDevices = useCallback(async () => {
    if (deviceList.length) {
      return null;
    }

    const constraints = {
      video: props.videoConstraints,
      audio: props.audioConstraints,
    };

    const intitialize = async () => {
      let { stream, errors } = await getAvailableMedia(constraints);
      const devices = await navigator.mediaDevices.enumerateDevices();
      setDeviceList(devices);

      if (stream) {
        const result = await correctDevicesOnSafari(stream, errors, devices, constraints, {
          video: null,
          audio: null,
        });
        stream = result.stream;
        errors = result.errors;
      }
      setVideoStream(stream);
      setAudioStream(stream);

      return { stream, errors };
    };

    const initializePromise = intitialize();
    initializationRef.current = initializePromise;

    const result = await initializePromise;

    initializationRef.current = null;
    if (result.errors.video || result.errors.audio) return result.errors;
    return null;
  }, [props.videoConstraints, props.audioConstraints, deviceList]);

  const getInitialStream = useCallback(async () => {
    const result = await initializationRef.current;
    return result?.stream ?? null;
  }, []);

  const camera = useDevice({
    mediaStream: videoStream,
    setStream: setVideoStream,
    getInitialStream,
    deviceType: "video",
    allDevicesList: deviceList,
    constraints: props.videoConstraints,
  });

  const microphone = useDevice({
    mediaStream: audioStream,
    setStream: setAudioStream,
    getInitialStream,
    deviceType: "audio",
    allDevicesList: deviceList,
    constraints: props.audioConstraints,
  });

  return {
    initializeDevices,
    camera,
    microphone,
  };
};
