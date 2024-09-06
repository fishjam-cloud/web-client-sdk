import { useFishjamContext } from "./useFishjamContext";
import type { Device, AudioDevice, DeviceState } from "../types";
import { useVideoDeviceManager } from "./deviceManagers/useVideoDeviceManager";
import { useAudioDeviceManager } from "./deviceManagers/useAudioDeviceManager";
import { useCallback } from "react";
import { getAvailableMedia, getCorrectedResult } from "../mediaInitializer";
import type { Track } from "../state.types";

function getDeviceProperties(currentTrack: Track | null, deviceState: DeviceState) {
  const rawStream = deviceState.media?.stream ?? null;
  const devices = deviceState.devices ?? [];
  const activeDevice = deviceState.media?.deviceInfo ?? null;

  const currentlyStreamed =
    currentTrack?.stream && currentTrack?.track
      ? {
          stream: currentTrack.stream,
          track: currentTrack.track,
          trackId: currentTrack.trackId,
        }
      : null;

  return { rawStream, devices, activeDevice, currentlyStreamed };
}

export function useCamera(): Device {
  const {
    videoTrackManager: { currentTrack, ...trackManager },
  } = useFishjamContext();
  const { deviceState } = useVideoDeviceManager();

  return {
    ...trackManager,
    ...getDeviceProperties(currentTrack, deviceState),
  };
}

export function useMicrophone(): AudioDevice {
  const {
    audioTrackManager: { currentTrack, ...trackManager },
  } = useFishjamContext();

  const { deviceState } = useAudioDeviceManager();
  const isAudioPlaying = currentTrack?.vadStatus === "speech";

  return {
    ...trackManager,
    ...getDeviceProperties(currentTrack, deviceState),
    isAudioPlaying,
  };
}

export const useInitializeDevices = () => {
  const { videoDeviceManagerRef, audioDeviceManagerRef, hasDevicesBeenInitializedRef } = useFishjamContext();

  const initializeDevices = useCallback(async () => {
    if (hasDevicesBeenInitializedRef.current) return;
    const videoManager = videoDeviceManagerRef.current;
    const audioManager = audioDeviceManagerRef.current;

    const constraints = {
      video: videoManager.getConstraints(true),
      audio: audioManager.getConstraints(true),
    };

    const previousDevices = {
      video: videoManager.getLastDevice(),
      audio: audioManager.getLastDevice(),
    };

    let [stream, deviceErrors] = await getAvailableMedia(constraints);

    const devices = await navigator.mediaDevices.enumerateDevices();

    const videoDevices = devices.filter(({ kind }) => kind === "videoinput");
    const audioDevices = devices.filter(({ kind }) => kind === "audioinput");

    if (stream) {
      [stream, deviceErrors] = await getCorrectedResult(stream, deviceErrors, devices, constraints, previousDevices);
    }

    videoManager.initialize(
      stream,
      stream?.getVideoTracks()?.[0] ?? null,
      videoDevices,
      !!constraints.video,
      deviceErrors.video,
    );
    audioManager.initialize(
      stream,
      stream?.getAudioTracks()?.[0] ?? null,
      audioDevices,
      !!constraints.audio,
      deviceErrors.audio,
    );
    hasDevicesBeenInitializedRef.current = true;
  }, [videoDeviceManagerRef, audioDeviceManagerRef, hasDevicesBeenInitializedRef]);

  return { initializeDevices };
};
