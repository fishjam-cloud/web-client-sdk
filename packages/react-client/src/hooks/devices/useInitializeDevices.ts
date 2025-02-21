import { useCallback } from "react";

import { prepareConstraints } from "../../devices/constraints";
import { getAvailableMedia, correctDevicesOnSafari } from "../../devices/mediaInitializer";
import { useFishjamContext } from "../internal/useFishjamContext";
import { type DeviceError } from "../../types/public";

export type UseInitializeDevicesParams = {
  enableVideo?: boolean;
  enableAudio?: boolean;
};

export type InitializeDevicesErrors = { audio: DeviceError | null; video: DeviceError | null };

/**
 * Hook allows you to initialize access to the devices before joining the room.
 * @category Devices
 */
export const useInitializeDevices = () => {
  const { videoDeviceManagerRef, audioDeviceManagerRef, hasDevicesBeenInitializedRef } = useFishjamContext();

  const initializeDevices: (params?: UseInitializeDevicesParams) => Promise<void | InitializeDevicesErrors> =
    useCallback(
      async ({ enableVideo = true, enableAudio = true }: UseInitializeDevicesParams = {}) => {
        if (hasDevicesBeenInitializedRef.current) return;
        hasDevicesBeenInitializedRef.current = true;

        const videoManager = videoDeviceManagerRef.current;
        const audioManager = audioDeviceManagerRef.current;

        const constraints = {
          video: enableVideo && videoManager.getConstraints(),
          audio: enableAudio && audioManager.getConstraints(),
        };

        const previousDevices = {
          video: videoManager.getLastDevice(),
          audio: audioManager.getLastDevice(),
        };

        // Attempt to start the last selected device to avoid an unnecessary restart.
        // Without this, the first device will start, and `correctDevicesOnSafari` will attempt to fix it.
        let [stream, deviceErrors] = await getAvailableMedia({
          video: enableVideo && prepareConstraints(previousDevices.video?.deviceId, constraints.video),
          audio: enableAudio && prepareConstraints(previousDevices.audio?.deviceId, constraints.audio),
        });

        const devices = await navigator.mediaDevices.enumerateDevices();

        const videoDevices = devices.filter(({ kind }) => kind === "videoinput");
        const audioDevices = devices.filter(({ kind }) => kind === "audioinput");

        if (stream) {
          [stream, deviceErrors] = await correctDevicesOnSafari(
            stream,
            deviceErrors,
            devices,
            constraints,
            previousDevices,
          );
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

        if (deviceErrors.video || deviceErrors.audio) {
          return { audio: deviceErrors.audio, video: deviceErrors.video } satisfies InitializeDevicesErrors;
        }
      },
      [videoDeviceManagerRef, audioDeviceManagerRef, hasDevicesBeenInitializedRef],
    );

  return {
    /**
     * Initialize access to the devices before joining the room
     */
    initializeDevices,
  };
};
