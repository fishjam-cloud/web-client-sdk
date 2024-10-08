import { useFishjamContext } from "./useFishjamContext";
import { useCallback } from "react";
import type { AudioDevice, Device } from "../types/public";
import { useDeviceManager } from "./deviceManagers/useDeviceManager";
import { getAvailableMedia, getCorrectedResult } from "../mediaInitializer";
import { prepareConstraints } from "../constraints";

/**
 *
 * @category Devices
 */
export function useCamera(): Device {
  const { videoTrackManager, videoDeviceManagerRef } = useFishjamContext();
  const { deviceState, status } = useDeviceManager(videoDeviceManagerRef.current);

  const { currentTrack, ...trackManager } = videoTrackManager;

  const stream = deviceState.media?.stream ?? null;
  const currentMiddleware = deviceState.currentMiddleware ?? null;
  const isStreaming = Boolean(currentTrack?.stream);
  const track = stream?.getAudioTracks()[0] ?? null;
  const trackId = currentTrack?.trackId ?? null;
  const devices = deviceState.devices ?? [];
  const activeDevice = deviceState.media?.deviceInfo ?? null;

  return {
    ...trackManager,
    currentMiddleware,
    status,
    stream,
    track,
    devices,
    activeDevice,
    isStreaming,
    trackId,
  };
}

/**
 *
 * @category Devices
 */
export function useMicrophone(): AudioDevice {
  const { audioTrackManager, audioDeviceManagerRef } = useFishjamContext();
  const { deviceState, status } = useDeviceManager(audioDeviceManagerRef.current);

  const { currentTrack, ...trackManager } = audioTrackManager;

  const stream = deviceState.media?.stream ?? null;
  const currentMiddleware = deviceState.currentMiddleware ?? null;
  const isStreaming = Boolean(currentTrack?.stream);
  const track = stream?.getAudioTracks()[0] ?? null;
  const trackId = currentTrack?.trackId ?? null;
  const devices = deviceState.devices ?? [];
  const activeDevice = deviceState.media?.deviceInfo ?? null;
  const isAudioPlaying = currentTrack?.vadStatus === "speech";

  return {
    ...trackManager,
    currentMiddleware,
    status,
    stream,
    track,
    isStreaming,
    trackId,
    devices,
    activeDevice,
    isAudioPlaying,
  };
}

/**
 *
 * @category Devices
 */
export const useInitializeDevices = () => {
  const { videoDeviceManagerRef, audioDeviceManagerRef, hasDevicesBeenInitializedRef } = useFishjamContext();

  const initializeDevices = useCallback(async () => {
    if (hasDevicesBeenInitializedRef.current) return;
    hasDevicesBeenInitializedRef.current = true;

    const videoManager = videoDeviceManagerRef.current;
    const audioManager = audioDeviceManagerRef.current;

    const constraints = {
      video: videoManager.getConstraints(),
      audio: audioManager.getConstraints(),
    };

    const previousDevices = {
      video: videoManager.getLastDevice(),
      audio: audioManager.getLastDevice(),
    };

    // Attempt to start the last selected device to avoid an unnecessary restart.
    // Without this, the first device will start, and `getCorrectedResult` will attempt to fix it.
    let [stream, deviceErrors] = await getAvailableMedia({
      video: prepareConstraints(previousDevices.video?.deviceId, constraints.video),
      audio: prepareConstraints(previousDevices.audio?.deviceId, constraints.audio),
    });

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
  }, [videoDeviceManagerRef, audioDeviceManagerRef, hasDevicesBeenInitializedRef]);

  return { initializeDevices };
};
