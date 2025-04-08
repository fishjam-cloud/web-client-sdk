import { useCallback, useEffect, useRef, useState } from "react";

import { prepareConstraints } from "../../../devices/constraints";
import { correctDevicesOnSafari, getAvailableMedia } from "../../../devices/mediaInitializer";
import type { DeviceError, InitializeDevicesResult, PersistLastDeviceHandlers } from "../../../types/public";
import { useDeviceManager } from "./useDeviceManager";

interface UseDevicesProps {
  videoConstraints?: MediaTrackConstraints | boolean;
  audioConstraints?: MediaTrackConstraints | boolean;
  persistHandlers?: PersistLastDeviceHandlers;
}

export type InitializeDevicesSettings = { enableVideo?: boolean; enableAudio?: boolean };

export const useMediaDevices = ({ videoConstraints, audioConstraints, persistHandlers }: UseDevicesProps) => {
  const [deviceList, setDeviceList] = useState<MediaDeviceInfo[]>([]);

  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  const [videoError, setVideoError] = useState<DeviceError | null>(null);
  const [audioError, setAudioError] = useState<DeviceError | null>(null);

  const [selectedCamera, setSelectedCamera] = useState<MediaDeviceInfo | null>(
    persistHandlers?.getLastDevice("video") ?? null,
  );
  const [selectedMic, setSelectedMic] = useState<MediaDeviceInfo | null>(
    persistHandlers?.getLastDevice("audio") ?? null,
  );

  const initializationRef = useRef<Promise<InitializeDevicesResult> | null>(null);

  const selectCamera = useCallback(
    (deviceInfo: MediaDeviceInfo) => {
      setSelectedCamera(deviceInfo);
      persistHandlers?.saveLastDevice(deviceInfo, "video");
    },
    [persistHandlers],
  );

  const selectMic = useCallback(
    (deviceInfo: MediaDeviceInfo) => {
      setSelectedMic(deviceInfo);
      persistHandlers?.saveLastDevice(deviceInfo, "audio");
    },
    [persistHandlers],
  );

  const initializeDevices = useCallback(
    async (settings?: InitializeDevicesSettings): Promise<InitializeDevicesResult> => {
      if (deviceList.length) {
        return { stream: null, errors: null, status: "already_initialized" };
      }

      const lastUsed = {
        audio: selectedMic,
        video: selectedCamera,
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
          selectCamera(videoDevice);
        }
        if (audioDevice) {
          selectMic(audioDevice);
        }

        setVideoStream(stream);
        setAudioStream(stream);
        setVideoError(errors.video);
        setAudioError(errors.audio);

        if (!stream) {
          return { status: "failed", errors, stream: null };
        } else if (errors.video || errors.audio) {
          return { status: "initialized_with_errors", errors, stream: null };
        } else {
          return { status: "initialized", errors: null, stream };
        }
      };

      const initializePromise = intitialize();
      initializationRef.current = initializePromise;

      return await initializePromise;
    },
    [deviceList, selectedMic, selectedCamera, videoConstraints, audioConstraints, selectCamera, selectMic],
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

  const cameraManager = useDeviceManager({
    mediaStream: videoStream,
    setMediaStream: setVideoStream,
    deviceError: videoError,
    setDeviceError: setVideoError,
    getInitialStream,
    deviceType: "video",
    allDevicesList: deviceList,
    constraints: videoConstraints,
    setSelectedDevice: selectCamera,
    selectedDevice: selectedCamera,
  });

  const microphoneManager = useDeviceManager({
    mediaStream: audioStream,
    setMediaStream: setAudioStream,
    deviceError: audioError,
    setDeviceError: setAudioError,
    getInitialStream,
    deviceType: "audio",
    allDevicesList: deviceList,
    constraints: audioConstraints,
    setSelectedDevice: selectMic,
    selectedDevice: selectedMic,
  });

  return {
    initializeDevices,
    cameraManager,
    microphoneManager,
  };
};
