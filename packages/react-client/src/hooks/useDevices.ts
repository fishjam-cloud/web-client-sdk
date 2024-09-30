import { useFishjamContext } from "./useFishjamContext";
import { useVideoDeviceManager } from "./deviceManagers/useVideoDeviceManager";
import { useAudioDeviceManager } from "./deviceManagers/useAudioDeviceManager";
import { useCallback } from "react";
import { getAvailableMedia, getCorrectedResult } from "../mediaInitializer";
import { useProcessedPreviewStream } from "./useProcessedPreviewStream";
import { prepareConstraints } from "../constraints";
import type { AudioDevice, Device } from "../types/public";

/**
 *
 * @category Devices
 */
export function useCamera(): Device {
  const { videoTrackManager } = useFishjamContext();
  const { deviceState, status } = useVideoDeviceManager();
  const { currentTrack, ...trackManager } = videoTrackManager;
  const processedPreviewStream = useProcessedPreviewStream(videoTrackManager, deviceState.media?.track);

  const stream = currentTrack?.stream ?? processedPreviewStream ?? deviceState.media?.stream ?? null;
  const isStreaming = Boolean(currentTrack?.stream);
  const track = stream?.getAudioTracks()[0] ?? null;
  const trackId = currentTrack?.trackId ?? null;
  const devices = deviceState.devices ?? [];
  const activeDevice = deviceState.media?.deviceInfo ?? null;

  return {
    ...trackManager,
    status,
    stream,
    devices,
    activeDevice,
    isStreaming,
    track,
    trackId,
  };
}
/**
 *
 * @category Devices
 */
export function useMicrophone(): AudioDevice {
  const { audioTrackManager } = useFishjamContext();

  const { deviceState, status } = useAudioDeviceManager();
  const { currentTrack, ...trackManager } = audioTrackManager;

  const processedPreviewStream = useProcessedPreviewStream(audioTrackManager, deviceState.media?.track);

  const stream = currentTrack?.stream ?? processedPreviewStream ?? deviceState.media?.stream ?? null;
  const isStreaming = Boolean(currentTrack?.stream);
  const track = stream?.getAudioTracks()[0] ?? null;
  const trackId = currentTrack?.trackId ?? null;
  const devices = deviceState.devices ?? [];
  const activeDevice = deviceState.media?.deviceInfo ?? null;
  const isAudioPlaying = currentTrack?.vadStatus === "speech";

  return {
    ...trackManager,
    status,
    stream,
    isStreaming,
    track,
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
      video: videoManager.getConstraints(true),
      audio: audioManager.getConstraints(true),
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
