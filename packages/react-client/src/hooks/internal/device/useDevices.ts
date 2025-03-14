import { useCallback, useRef, useState } from "react";

import { prepareConstraints } from "../../../devices/constraints";
import { correctDevicesOnSafari, getAvailableMedia } from "../../../devices/mediaInitializer";
import type { AudioVideo } from "../../../types/internal";
import type { DeviceError, PersistLastDeviceHandlers } from "../../../types/public";
import { useDeviceManager } from "./useDevice";
import { useHandleTrackEnd } from "./useHandleStreamEnd";

interface UseDevicesProps {
  videoConstraints?: MediaTrackConstraints | boolean;
  audioConstraints?: MediaTrackConstraints | boolean;
  persistHandlers?: PersistLastDeviceHandlers;
}

type InitializeDevicesResult = { stream: MediaStream | null; errors: AudioVideo<DeviceError | null> | null };

export const useMediaDevices = ({ videoConstraints, audioConstraints, persistHandlers }: UseDevicesProps) => {
  const [deviceList, setDeviceList] = useState<MediaDeviceInfo[]>([]);

  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  const [videoError, setVideoError] = useState<DeviceError | null>(null);
  const [audioError, setAudioError] = useState<DeviceError | null>(null);

  const lastUsedCameraRef = useRef<MediaDeviceInfo | null>(persistHandlers?.getLastDevice("video") ?? null);
  const lastUsedMicRef = useRef<MediaDeviceInfo | null>(persistHandlers?.getLastDevice("audio") ?? null);

  const initializationRef = useRef<Promise<InitializeDevicesResult> | null>(null);

  const saveUsedCamera = useCallback(
    (deviceInfo: MediaDeviceInfo) => {
      lastUsedCameraRef.current = deviceInfo;
      persistHandlers?.saveLastDevice(deviceInfo, "video");
    },
    [persistHandlers],
  );

  const saveUsedMic = useCallback(
    (deviceInfo: MediaDeviceInfo) => {
      lastUsedMicRef.current = deviceInfo;
      persistHandlers?.saveLastDevice(deviceInfo, "audio");
    },
    [persistHandlers],
  );

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
        video: settings?.enableVideo !== false && prepareConstraints(lastUsed.video?.deviceId, videoConstraints),
        audio: settings?.enableAudio !== false && prepareConstraints(lastUsed.audio?.deviceId, audioConstraints),
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
        setVideoError(result.errors.video);
        setAudioError(result.errors.audio);

        return result;
      };

      const initializePromise = intitialize();
      initializationRef.current = initializePromise;

      const result = await initializePromise;

      initializationRef.current = null;
      if (result.errors.video || result.errors.audio) return result.errors;
      return null;
    },
    [deviceList, videoConstraints, audioConstraints, saveUsedCamera, saveUsedMic],
  );

  const getInitialStream = useCallback(async () => {
    const result = await initializationRef.current;
    return result?.stream ?? null;
  }, []);

  useHandleTrackEnd({ stream: videoStream, setStream: setVideoStream, type: "video" });
  useHandleTrackEnd({ stream: audioStream, setStream: setAudioStream, type: "audio" });

  const cameraManager = useDeviceManager({
    mediaStream: videoStream,
    setStream: setVideoStream,
    deviceError: videoError,
    setError: setVideoError,
    getInitialStream,
    deviceType: "video",
    allDevicesList: deviceList,
    constraints: videoConstraints,
    saveUsedDevice: saveUsedCamera,
  });

  const microphoneManager = useDeviceManager({
    mediaStream: audioStream,
    setStream: setAudioStream,
    deviceError: audioError,
    setError: setAudioError,
    getInitialStream,
    deviceType: "audio",
    allDevicesList: deviceList,
    constraints: audioConstraints,
    saveUsedDevice: saveUsedMic,
  });

  return {
    initializeDevices,
    cameraManager,
    microphoneManager,
  };
};
