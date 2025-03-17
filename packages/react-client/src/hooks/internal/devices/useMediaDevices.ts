import { useCallback, useEffect, useRef, useState } from "react";

import { prepareConstraints } from "../../../devices/constraints";
import { correctDevicesOnSafari, getAvailableMedia } from "../../../devices/mediaInitializer";
import type { DeviceError, InitializeDevicesResult, PersistLastDeviceHandlers } from "../../../types/public";
import { useDeviceManager } from "./useDeviceManager";
import { useHandleTrackEnd } from "./useHandleStreamEnd";

interface UseDevicesProps {
  videoConstraints?: MediaTrackConstraints | boolean;
  audioConstraints?: MediaTrackConstraints | boolean;
  persistHandlers?: PersistLastDeviceHandlers;
}

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
    async (settings?: { enableVideo?: boolean; enableAudio?: boolean }): Promise<InitializeDevicesResult> => {
      if (deviceList.length) {
        return { stream: null, errors: null, status: "already_initialized" };
      }

      const lastUsed = {
        audio: lastUsedMicRef.current,
        video: lastUsedCameraRef.current,
      };

      const constraints = {
        video: settings?.enableVideo !== false && prepareConstraints(lastUsed.video?.deviceId, videoConstraints),
        audio: settings?.enableAudio !== false && prepareConstraints(lastUsed.audio?.deviceId, audioConstraints),
      };

      const intitialize = async (): Promise<InitializeDevicesResult> => {
        let media = await getAvailableMedia(constraints);
        const devices = await navigator.mediaDevices.enumerateDevices();
        setDeviceList(devices);

        if (media.stream) {
          media = await correctDevicesOnSafari(media.stream, media.errors, devices, constraints, lastUsed);
        }

        const { stream, errors } = media;

        const videoDevice = deviceList.find(
          (device) => device.deviceId === stream?.getVideoTracks()[0].getSettings().deviceId,
        );
        const audioDevice = deviceList.find(
          (device) => device.deviceId === stream?.getAudioTracks()[0].getSettings().deviceId,
        );

        if (videoDevice) {
          saveUsedCamera(videoDevice);
        }
        if (audioDevice) {
          saveUsedMic(audioDevice);
        }

        setVideoStream(stream);
        setAudioStream(stream);
        setVideoError(errors.video);
        setAudioError(errors.audio);

        if (!stream) {
          return { status: "failed", errors: errors, stream: null };
        } else if (errors.video || errors.audio) {
          return { status: "initialized_with_errors", errors, stream: null };
        } else {
          return { status: "initialized", stream, errors: null };
        }
      };

      const initializePromise = intitialize();
      initializationRef.current = initializePromise;

      return await initializePromise;
    },
    [deviceList, videoConstraints, audioConstraints, saveUsedCamera, saveUsedMic],
  );

  useEffect(() => {
    const isInitialStreamIrrelevant = videoStream !== audioStream;

    if (isInitialStreamIrrelevant) {
      initializationRef.current = null;
    }
  }, [videoStream, audioStream]);

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
