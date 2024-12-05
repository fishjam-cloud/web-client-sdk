import { useCallback } from "react";

import { prepareConstraints } from "../../devices/constraints";
import { getAvailableMedia, getCorrectedResult } from "../../devices/mediaInitializer";
import { useFishjamContext } from "../internal/useFishjamContext";

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
