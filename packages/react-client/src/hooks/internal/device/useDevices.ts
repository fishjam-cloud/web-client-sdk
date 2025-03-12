import { useCallback, useRef, useState } from "react";

import { prepareConstraints } from "../../../devices/constraints";
import { correctDevicesOnSafari, getAvailableMedia } from "../../../devices/mediaInitializer";
import type { AudioVideo } from "../../../types/internal";
import type { DeviceError } from "../../../types/public";
import { getLastDevice, saveLastDevice } from "../../../utils/localStorage";
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

  const lastUsedCameraRef = useRef<MediaDeviceInfo | null>(getLastDevice("video"));
  const lastUsedMicRef = useRef<MediaDeviceInfo | null>(getLastDevice("audio"));

  const initializationRef = useRef<Promise<InitializeDevicesResult> | null>(null);

  const saveUsedCamera = useCallback((deviceInfo: MediaDeviceInfo) => {
    lastUsedCameraRef.current = deviceInfo;
    saveLastDevice(deviceInfo, "video");
  }, []);

  const saveUsedMic = useCallback((deviceInfo: MediaDeviceInfo) => {
    lastUsedMicRef.current = deviceInfo;
    saveLastDevice(deviceInfo, "audio");
  }, []);

  const initializeDevices = useCallback(
    async (settings?: { enableVideo?: boolean; enableAudio?: boolean }) => {
      if (deviceList.length) {
        return null;
      }

      const lastUsed = {
        audio: lastUsedMicRef.current,
        video: lastUsedCameraRef.current,
      };

      const constraints = {
        video: settings?.enableVideo !== false && prepareConstraints(lastUsed.video?.deviceId, props.videoConstraints),
        audio: settings?.enableAudio !== false && prepareConstraints(lastUsed.audio?.deviceId, props.audioConstraints),
      };

      const intitialize = async () => {
        let result = await getAvailableMedia(constraints);
        const devices = await navigator.mediaDevices.enumerateDevices();
        setDeviceList(devices);

        if (result.stream) {
          result = await correctDevicesOnSafari(result.stream, result.errors, devices, constraints, lastUsed);
        }

        const videoDevice = deviceList.find(
          (device) => device.deviceId === result.stream?.getVideoTracks()[0].getSettings().deviceId,
        );
        const audioDevice = deviceList.find(
          (device) => device.deviceId === result.stream?.getAudioTracks()[0].getSettings().deviceId,
        );

        if (videoDevice) {
          saveUsedCamera(videoDevice);
        }
        if (audioDevice) {
          saveUsedMic(audioDevice);
        }

        setVideoStream(result.stream);
        setAudioStream(result.stream);

        return result;
      };

      const initializePromise = intitialize();
      initializationRef.current = initializePromise;

      const result = await initializePromise;

      initializationRef.current = null;
      if (result.errors.video || result.errors.audio) return result.errors;
      return null;
    },
    [deviceList, props.videoConstraints, props.audioConstraints, saveUsedCamera, saveUsedMic],
  );

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
    saveUsedDevice: saveUsedCamera,
  });

  const microphone = useDevice({
    mediaStream: audioStream,
    setStream: setAudioStream,
    getInitialStream,
    deviceType: "audio",
    allDevicesList: deviceList,
    constraints: props.audioConstraints,
    saveUsedDevice: saveUsedMic,
  });

  return {
    initializeDevices,
    camera,
    microphone,
  };
};
