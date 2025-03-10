import { useCallback, useRef, useState } from "react";

import { correctDevicesOnSafari, getAvailableMedia } from "../../../devices/mediaInitializer";
import { useDevice } from "./useDevice";

interface UseDevicesProps {
  videoConstraints?: MediaTrackConstraints | boolean;
  audioConstraints?: MediaTrackConstraints | boolean;
}

export const useDevices = (props: UseDevicesProps) => {
  const [deviceList, setDeviceList] = useState<MediaDeviceInfo[]>([]);

  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

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

  const getInitialStream = useCallback(async () => {
    return await initializationRef.current;
  }, []);

  const camera = useDevice({
    mediaStream: videoStream,
    setStream: setVideoStream,
    getInitialStream,
    deviceType: "video",
    deviceList,
    constraints: props.videoConstraints,
  });

  const microphone = useDevice({
    mediaStream: audioStream,
    setStream: setAudioStream,
    getInitialStream,
    deviceType: "audio",
    deviceList,
    constraints: props.videoConstraints,
  });

  return {
    deviceList,
    getAccessToDevices,
    camera,
    microphone,
  };
};
