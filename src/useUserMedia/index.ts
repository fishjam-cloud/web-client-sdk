import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CurrentDevices,
  DeviceError,
  DevicePersistence,
  DeviceReturnType,
  DeviceState,
  Errors,
  GetMedia,
  Media,
  Type,
  UseUserMedia,
  UseUserMediaConfig,
  UseUserMediaStartConfig,
  UseUserMediaState,
} from "./types";
import { loadObject, saveObject } from "../localStorage";
import {
  getExactDeviceConstraint,
  prepareConstraints,
  prepareMediaTrackConstraints,
  toMediaTrackConstraints,
} from "./constraints";

const removeExact = (
  trackConstraints: boolean | MediaTrackConstraints | undefined
): boolean | MediaTrackConstraints | undefined => {
  if (typeof trackConstraints === "object") {
    const copy: MediaTrackConstraints = { ...trackConstraints };
    delete copy["deviceId"];
    return copy;
  }
  return trackConstraints;
};

const REQUESTING = "Requesting";
const NOT_REQUESTED = "Not requested";
const PERMISSION_DENIED: DeviceError = { name: "NotAllowedError" };
const OVERCONSTRAINED_ERROR: DeviceError = { name: "OverconstrainedError" };

const isVideo = (device: MediaDeviceInfo) => device.kind === "videoinput";
const isAudio = (device: MediaDeviceInfo) => device.kind === "audioinput";

const getDeviceInfo = (trackDeviceId: string | null, devices: MediaDeviceInfo[]): MediaDeviceInfo | null =>
  (trackDeviceId && devices.find(({ deviceId }) => trackDeviceId === deviceId)) || null;

const getCurrentDevicesSettings = (
  requestedDevices: MediaStream,
  mediaDeviceInfos: MediaDeviceInfo[]
): CurrentDevices => {
  const currentDevices: CurrentDevices = { videoinput: null, audioinput: null };

  for (const track of requestedDevices.getTracks()) {
    const settings = track.getSettings();
    if (settings.deviceId) {
      const currentDevice = mediaDeviceInfos.find((device) => device.deviceId == settings.deviceId);
      const kind = currentDevice?.kind ?? null;
      if ((currentDevice && kind === "videoinput") || kind === "audioinput") {
        currentDevices[kind] = currentDevice ?? null;
      }
    }
  }
  return currentDevices;
};

const isDeviceDifferentFromLastSession = (lastDevice: MediaDeviceInfo | null, currentDevice: MediaDeviceInfo | null) =>
  lastDevice && (currentDevice?.deviceId !== lastDevice.deviceId || currentDevice?.label !== lastDevice?.label);

const isAnyDeviceDifferentFromLastSession = (
  lastVideoDevice: MediaDeviceInfo | null,
  lastAudioDevice: MediaDeviceInfo | null,
  currentDevices: CurrentDevices | null
): boolean =>
  !!(
    (currentDevices?.videoinput &&
      isDeviceDifferentFromLastSession(lastVideoDevice, currentDevices?.videoinput || null)) ||
    (currentDevices?.audioinput &&
      isDeviceDifferentFromLastSession(lastAudioDevice, currentDevices?.audioinput || null))
  );

// https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#exceptions
// OverconstrainedError has higher priority than NotAllowedError
const parseError = (error: unknown): DeviceError | null => {
  if (error && typeof error === "object" && "name" in error) {
    if (error.name === "NotAllowedError") {
      return PERMISSION_DENIED;
    } else if (error.name === "OverconstrainedError") {
      return OVERCONSTRAINED_ERROR;
    }
  }
  // todo handle unknown error
  return null;
};

const stopTracks = (requestedDevices: MediaStream) => {
  for (const track of requestedDevices.getTracks()) {
    track.stop();
  }
};

const getMedia = async (constraints: MediaStreamConstraints, previousErrors: Errors): Promise<GetMedia> => {
  try {
    const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    return { stream: mediaStream, type: "OK", constraints, previousErrors };
  } catch (error: unknown) {
    const parsedError: DeviceError | null = parseError(error);
    return { error: parsedError, type: "Error", constraints };
  }
};

const handleOverconstrainedError = async (constraints: MediaStreamConstraints): Promise<GetMedia> => {
  const videoResult = await getMedia({ video: removeExact(constraints.video), audio: constraints.audio }, {});
  if (videoResult.type === "OK" || videoResult.error?.name === "NotAllowedError") {
    return videoResult;
  }

  const audioResult = await getMedia({ video: constraints.video, audio: removeExact(constraints.audio) }, {});
  if (audioResult.type === "OK" || audioResult.error?.name === "NotAllowedError") {
    return audioResult;
  }

  return await getMedia({ video: removeExact(constraints.video), audio: removeExact(constraints.audio) }, {});
};

const handleNotAllowedError = async (constraints: MediaStreamConstraints): Promise<GetMedia> => {
  const videoResult = await getMedia({ video: false, audio: constraints.audio }, { video: PERMISSION_DENIED });
  if (videoResult.type === "OK") {
    return videoResult;
  }

  const audioResult = await getMedia({ video: constraints.video, audio: false }, { audio: PERMISSION_DENIED });
  if (audioResult.type === "OK") {
    return audioResult;
  }

  return await getMedia({ video: false, audio: false }, { video: PERMISSION_DENIED, audio: PERMISSION_DENIED });
};

const getError = (result: GetMedia, type: "audio" | "video"): DeviceError | null => {
  if (result.type === "OK") {
    return result.previousErrors[type] || null;
  }
  return PERMISSION_DENIED;
};

const prepareStatus = (
  requested: boolean,
  track: MediaStreamTrack | null,
  deviceError: DeviceError | null
): [DeviceReturnType, DeviceError | null] => {
  if (!requested) return ["Not requested", null];
  if (track) return ["OK", null];
  if (deviceError) return ["Error", deviceError];
  return ["Error", null];
};

const prepareDeviceState = (
  stream: MediaStream | null,
  track: MediaStreamTrack | null,
  devices: MediaDeviceInfo[],
  error: DeviceError | null,
  shouldAskForVideo: boolean
) => {
  const deviceInfo = getDeviceInfo(track?.getSettings()?.deviceId || null, devices);
  const [status, newError] = prepareStatus(shouldAskForVideo, track, error);

  return {
    devices,
    status,
    media: {
      stream: track ? stream : null,
      track: track,
      deviceInfo,
      enabled: !!track,
    },
    error: error ?? newError,
  };
};

const LOCAL_STORAGE_VIDEO_DEVICE_KEY = "last-selected-video-device";
const LOCAL_STORAGE_AUDIO_DEVICE_KEY = "last-selected-audio-device";
const LOCAL_STORAGE_DEVICE_PERSISTENCE: DevicePersistence = {
  getLastAudioDevice: () => loadObject<MediaDeviceInfo | null>(LOCAL_STORAGE_AUDIO_DEVICE_KEY, null),
  saveLastAudioDevice: (info: MediaDeviceInfo) => saveObject<MediaDeviceInfo>(LOCAL_STORAGE_AUDIO_DEVICE_KEY, info),
  getLastVideoDevice: () => loadObject<MediaDeviceInfo | null>(LOCAL_STORAGE_VIDEO_DEVICE_KEY, null),
  saveLastVideoDevice: (info: MediaDeviceInfo) => saveObject<MediaDeviceInfo>(LOCAL_STORAGE_VIDEO_DEVICE_KEY, info),
};

const INITIAL_STATE: UseUserMediaState = {
  video: {
    status: "Not requested",
    media: null,
    devices: null,
    error: null,
  },
  audio: {
    status: "Not requested",
    media: null,
    devices: null,
    error: null,
  },
};

/**
 * This hook is responsible for managing Media Devices and Media Streams from those devices.
 *
 * It stores all available devices and devices that are currently in use.
 *
 * It can also store previously selected devices, so it can retrieve them after a page reload.
 *
 * The inner algorithm should only open one prompt for both audio and video.
 *
 * If it's not possible to get the previous device (e.g. because the device doesn't exist),
 * it tries to recover by loosening constraints on each device one by one to overcome OverconstrainedError.
 *
 * If one device is not available (e.g. if the user closed the prompt or permanently blocked the device,
 * resulting in NotAllowedError), it tries to identify which device is not available and turns on the remaining one.
 */
export const useUserMedia = ({
  storage,
  videoTrackConstraints,
  audioTrackConstraints,
  fetchOnMount = false,
}: UseUserMediaConfig): UseUserMedia => {
  const [state, setState] = useState<UseUserMediaState>(INITIAL_STATE);
  const skip = useRef<boolean>(false);

  const audioConstraints = useMemo(() => toMediaTrackConstraints(audioTrackConstraints), [audioTrackConstraints]);
  const videoConstraints = useMemo(() => toMediaTrackConstraints(videoTrackConstraints), [videoTrackConstraints]);

  const { getLastAudioDevice, saveLastAudioDevice, getLastVideoDevice, saveLastVideoDevice } = useMemo(() => {
    if (storage === false) {
      return {
        getLastVideoDevice: null,
        getLastAudioDevice: null,
        saveLastAudioDevice: null,
        saveLastVideoDevice: null,
      };
    }
    if (storage === true) return LOCAL_STORAGE_DEVICE_PERSISTENCE;
    return storage;
  }, [storage]);

  const init = useCallback(async () => {
    if (skip.current) return;
    skip.current = true;
    if (!navigator?.mediaDevices) throw Error("Navigator is available only in secure contexts");

    const previousVideoDevice: MediaDeviceInfo | null = getLastVideoDevice?.() ?? null;
    const previousAudioDevice: MediaDeviceInfo | null = getLastAudioDevice?.() ?? null;

    const shouldAskForVideo = !!videoTrackConstraints;
    const shouldAskForAudio = !!audioTrackConstraints;

    setState((prevState) => ({
      ...prevState,
      video: {
        ...prevState.video,
        status: shouldAskForVideo && videoConstraints ? REQUESTING : prevState.video.status ?? NOT_REQUESTED,
      },
      audio: {
        ...prevState.audio,
        status: shouldAskForAudio && audioConstraints ? REQUESTING : prevState.audio.status ?? NOT_REQUESTED,
      },
    }));

    let requestedDevices: MediaStream | null = null;
    const constraints = {
      video: shouldAskForVideo && getExactDeviceConstraint(videoConstraints, previousVideoDevice?.deviceId),
      audio: shouldAskForAudio && getExactDeviceConstraint(audioConstraints, previousAudioDevice?.deviceId),
    };

    let result: GetMedia = await getMedia(constraints, {});

    if (result.type === "Error" && result.error?.name === "OverconstrainedError") {
      result = await handleOverconstrainedError(constraints);
    }

    if (result.type === "Error" && result.error?.name === "NotAllowedError") {
      result = await handleNotAllowedError(result.constraints);
    }

    const mediaDeviceInfos: MediaDeviceInfo[] = await navigator.mediaDevices.enumerateDevices();

    if (result.type === "OK") {
      requestedDevices = result.stream;
      // Safari changes deviceId between sessions, therefore we cannot rely on deviceId for identification purposes.
      // We can switch a random device that comes from safari to one that has the same label as the one used in the previous session.
      const currentDevices = getCurrentDevicesSettings(requestedDevices, mediaDeviceInfos);
      const shouldCorrectDevices = isAnyDeviceDifferentFromLastSession(
        previousVideoDevice,
        previousAudioDevice,
        currentDevices
      );
      if (shouldCorrectDevices) {
        const videoIdToStart = mediaDeviceInfos.find((info) => info.label === previousVideoDevice?.label)?.deviceId;
        const audioIdToStart = mediaDeviceInfos.find((info) => info.label === previousAudioDevice?.label)?.deviceId;

        if (videoIdToStart || audioIdToStart) {
          stopTracks(requestedDevices);

          const exactConstraints: MediaStreamConstraints = {
            video: !!result.constraints.video && prepareConstraints(videoIdToStart, videoConstraints),
            audio: !!result.constraints.video && prepareConstraints(audioIdToStart, audioConstraints),
          };

          const correctedResult = await getMedia(exactConstraints, result.previousErrors);

          if (correctedResult.type === "OK") {
            requestedDevices = correctedResult.stream;
          } else {
            console.error("Device Manager unexpected error");
          }
        }
      }
    }

    const video: DeviceState = prepareDeviceState(
      requestedDevices,
      requestedDevices?.getVideoTracks()[0] || null,
      mediaDeviceInfos.filter(isVideo),
      getError(result, "video"),
      shouldAskForVideo
    );

    const audio: DeviceState = prepareDeviceState(
      requestedDevices,
      requestedDevices?.getAudioTracks()[0] || null,
      mediaDeviceInfos.filter(isAudio),
      getError(result, "audio"),
      shouldAskForAudio
    );

    setState({
      video,
      audio,
    });

    if (video.media?.deviceInfo) {
      saveLastVideoDevice?.(video.media.deviceInfo);
    }

    if (audio.media?.deviceInfo) {
      saveLastAudioDevice?.(audio.media?.deviceInfo);
    }
  }, [
    getLastVideoDevice,
    getLastAudioDevice,
    videoTrackConstraints,
    audioTrackConstraints,
    videoConstraints,
    audioConstraints,
    saveLastVideoDevice,
    saveLastAudioDevice,
  ]);

  const start = useCallback(
    async ({ audioDeviceId, videoDeviceId }: UseUserMediaStartConfig) => {
      const shouldRestartVideo = !!videoDeviceId && videoDeviceId !== state.video.media?.deviceInfo?.deviceId;
      const shouldRestartAudio = !!audioDeviceId && audioDeviceId !== state.audio.media?.deviceInfo?.deviceId;

      const exactConstraints: MediaStreamConstraints = {
        video: shouldRestartVideo && prepareMediaTrackConstraints(videoDeviceId, videoConstraints),
        audio: shouldRestartAudio && prepareMediaTrackConstraints(audioDeviceId, audioConstraints),
      };

      if (!exactConstraints.video && !exactConstraints.audio) return;

      const result = await getMedia(exactConstraints, {});

      if (result.type == "OK") {
        const stream = result.stream;

        if (shouldRestartVideo) {
          state?.video.media?.track?.stop();
        }

        const videoInfo = videoDeviceId ? getDeviceInfo(videoDeviceId, state.video.devices ?? []) : null;
        if (videoInfo) {
          saveLastVideoDevice?.(videoInfo);
        }

        if (shouldRestartAudio) {
          state?.audio.media?.track?.stop();
        }

        const audioInfo = audioDeviceId ? getDeviceInfo(audioDeviceId, state.audio.devices ?? []) : null;

        if (audioInfo) {
          saveLastAudioDevice?.(audioInfo);
        }

        setState((prevState): UseUserMediaState => {
          const videoMedia: Media | null = shouldRestartVideo
            ? {
                stream,
                track: stream.getVideoTracks()[0] || null,
                deviceInfo: videoInfo,
                enabled: true,
              }
            : prevState.video.media;

          const audioMedia: Media | null = shouldRestartAudio
            ? {
                stream,
                track: stream.getAudioTracks()[0] || null,
                deviceInfo: audioInfo,
                enabled: true,
              }
            : prevState.audio.media;

          return {
            ...prevState,
            video: { ...prevState.video, media: videoMedia },
            audio: { ...prevState.audio, media: audioMedia },
          };
        });
      } else {
        const parsedError = result.error;

        setState((prevState) => {
          const videoError = exactConstraints.video ? parsedError : prevState.video.error;
          const audioError = exactConstraints.audio ? parsedError : prevState.audio.error;

          return {
            ...prevState,
            video: { ...prevState.video, error: videoError },
            audio: { ...prevState.audio, error: audioError },
          };
        });
      }
    },
    [state, audioConstraints, saveLastAudioDevice, videoConstraints, saveLastVideoDevice]
  );

  const stop = useCallback(async (type: Type) => {
    setState((prevState) => {
      prevState?.[type]?.media?.track?.stop();

      return { ...prevState, [type]: { ...prevState[type], media: null } };
    });
  }, []);

  const setEnable = useCallback((type: Type, value: boolean) => {
    setState((prevState) => {
      const media = prevState[type].media;
      if (!media || !media.track) {
        return prevState;
      }

      media.track.enabled = value;

      return { ...prevState, [type]: { ...prevState[type], media: { ...media, enabled: value } } };
    });
  }, []);

  useEffect(() => {
    if (fetchOnMount) {
      init();
    }
    // eslint-disable-next-line
  }, []);

  return useMemo(
    () => ({
      data: state,
      start,
      stop,
      init,
      setEnable,
    }),
    [start, state, stop, init, setEnable]
  );
};
