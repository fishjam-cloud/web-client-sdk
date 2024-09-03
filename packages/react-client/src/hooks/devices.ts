import { useFishjamContext } from "./fishjamContext";
import type { Device, AudioDevice } from "../types";

export function useCamera(): Device {
  const {
    state,
    videoTrackManager: { currentTrack, ...trackManager },
  } = useFishjamContext();

  const streamedTrackId = currentTrack?.trackId ?? null;
  const streamedTrack = currentTrack?.track ?? null;
  // todo: temporary fix, fix in FCE-450
  const stream = currentTrack?.stream ?? state.devices.camera.stream ?? null;
  const devices = state.devices.camera.devices ?? [];
  const activeDevice = state.devices.camera.deviceInfo;

  return { ...trackManager, streamedTrack, streamedTrackId, stream, devices, activeDevice };
}

export function useMicrophone(): AudioDevice {
  const {
    state,
    audioTrackManager: { currentTrack, ...trackManager },
  } = useFishjamContext();

  const isAudioPlaying = currentTrack?.vadStatus === "speech";
  const streamedTrackId = currentTrack?.trackId ?? null;
  const streamedTrack = currentTrack?.track ?? null;
  // todo: temporary fix, fix in FCE-450
  const stream = currentTrack?.stream ?? state.devices.microphone.stream ?? null;
  const devices = state.devices.microphone.devices ?? [];
  const activeDevice = state.devices.microphone.deviceInfo;

  return { ...trackManager, streamedTrack, streamedTrackId, isAudioPlaying, stream, devices, activeDevice };
}
