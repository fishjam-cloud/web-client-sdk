import type {
  AudioOrVideoType,
  CurrentDevices,
  DeviceError,
  DeviceManagerConfig,
  DevicesStatus,
  DeviceState,
  Errors,
  GetMedia,
  DeviceManagerInitConfig,
  Media,
  StorageConfig,
  DeviceManagerStartConfig,
} from "./types";
import { NOT_FOUND_ERROR, OVERCONSTRAINED_ERROR, parseError, PERMISSION_DENIED, UNHANDLED_ERROR } from "./types";

import { loadObject, saveObject } from "./localStorage";
import {
  getExactDeviceConstraint,
  prepareConstraints,
  prepareMediaTrackConstraints,
  toMediaTrackConstraints,
} from "./constraints";

import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import type { TrackType } from "./ScreenShareManager";

const removeExact = (
  trackConstraints: boolean | MediaTrackConstraints | undefined,
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

const isVideo = (device: MediaDeviceInfo) => device.kind === "videoinput";
const isAudio = (device: MediaDeviceInfo) => device.kind === "audioinput";

const getDeviceInfo = (trackDeviceId: string | null, devices: MediaDeviceInfo[]): MediaDeviceInfo | null =>
  (trackDeviceId && devices.find(({ deviceId }) => trackDeviceId === deviceId)) || null;

const getCurrentDevicesSettings = (
  requestedDevices: MediaStream,
  mediaDeviceInfos: MediaDeviceInfo[],
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
  currentDevices: CurrentDevices | null,
): boolean =>
  !!(
    (currentDevices?.videoinput &&
      isDeviceDifferentFromLastSession(lastVideoDevice, currentDevices?.videoinput || null)) ||
    (currentDevices?.audioinput &&
      isDeviceDifferentFromLastSession(lastAudioDevice, currentDevices?.audioinput || null))
  );

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

const handleNotFoundError = async (constraints: MediaStreamConstraints): Promise<GetMedia> => {
  const withoutVideo = await getMedia(
    { video: false, audio: constraints.audio },
    {
      video: NOT_FOUND_ERROR,
    },
  );

  if (withoutVideo.type === "OK") {
    return withoutVideo;
  }

  const withoutAudio = await getMedia({ video: constraints.video, audio: false }, { audio: NOT_FOUND_ERROR });

  if (withoutAudio.type === "OK") {
    return withoutAudio;
  }

  return await getMedia({ video: false, audio: false }, { audio: NOT_FOUND_ERROR, video: NOT_FOUND_ERROR });
};

const handleOverconstrainedError = async (constraints: MediaStreamConstraints): Promise<GetMedia> => {
  const notExactVideo = await getMedia(
    {
      video: removeExact(constraints.video),
      audio: constraints.audio,
    },
    { video: OVERCONSTRAINED_ERROR },
  );
  if (notExactVideo.type === "OK" || notExactVideo.error?.name === "NotAllowedError") {
    return notExactVideo;
  }

  const notExactAudio = await getMedia(
    {
      video: constraints.video,
      audio: removeExact(constraints.audio),
    },
    { audio: OVERCONSTRAINED_ERROR },
  );

  if (notExactAudio.type === "OK" || notExactAudio.error?.name === "NotAllowedError") {
    return notExactAudio;
  }

  return await getMedia(
    { video: removeExact(constraints.video), audio: removeExact(constraints.audio) },
    {
      video: OVERCONSTRAINED_ERROR,
      audio: OVERCONSTRAINED_ERROR,
    },
  );
};

const handleNotAllowedError = async (constraints: MediaStreamConstraints): Promise<GetMedia> => {
  const withoutVideo = await getMedia({ video: false, audio: constraints.audio }, { video: PERMISSION_DENIED });
  if (withoutVideo.type === "OK") {
    return withoutVideo;
  }

  const withoutAudio = await getMedia({ video: constraints.video, audio: false }, { audio: PERMISSION_DENIED });
  if (withoutAudio.type === "OK") {
    return withoutAudio;
  }

  return await getMedia({ video: false, audio: false }, { video: PERMISSION_DENIED, audio: PERMISSION_DENIED });
};

const getError = (result: GetMedia, type: AudioOrVideoType): DeviceError | null => {
  if (result.type === "OK") {
    return result.previousErrors[type] || null;
  }

  console.warn({ name: "Unhandled DeviceManager error", result });
  return UNHANDLED_ERROR;
};

const prepareStatus = (
  requested: boolean,
  track: MediaStreamTrack | null,
  deviceError: DeviceError | null,
): [DevicesStatus, DeviceError | null] => {
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
  shouldAsk: boolean,
): DeviceState => {
  const deviceInfo = getDeviceInfo(track?.getSettings()?.deviceId || null, devices);
  const [devicesStatus, newError] = prepareStatus(shouldAsk, track, error);

  return {
    devices,
    devicesStatus,
    media: {
      stream: track ? stream : null,
      track: track,
      deviceInfo,
      enabled: !!track,
    },
    mediaStatus: devicesStatus,
    error: error ?? newError,
  };
};

const LOCAL_STORAGE_VIDEO_DEVICE_KEY = "last-selected-video-device";
const LOCAL_STORAGE_AUDIO_DEVICE_KEY = "last-selected-audio-device";

const DISABLE_STORAGE_CONFIG: StorageConfig = {
  getLastVideoDevice: null,
  getLastAudioDevice: null,
  saveLastAudioDevice: () => {},
  saveLastVideoDevice: () => {},
};

const LOCAL_STORAGE_CONFIG: StorageConfig = {
  getLastAudioDevice: () => loadObject<MediaDeviceInfo | null>(LOCAL_STORAGE_AUDIO_DEVICE_KEY, null),
  saveLastAudioDevice: (info: MediaDeviceInfo) => saveObject<MediaDeviceInfo>(LOCAL_STORAGE_AUDIO_DEVICE_KEY, info),
  getLastVideoDevice: () => loadObject<MediaDeviceInfo | null>(LOCAL_STORAGE_VIDEO_DEVICE_KEY, null),
  saveLastVideoDevice: (info: MediaDeviceInfo) => saveObject<MediaDeviceInfo>(LOCAL_STORAGE_VIDEO_DEVICE_KEY, info),
};

export type DeviceManagerEvents = {
  managerStarted: (
    event: {
      trackType: TrackType;
      videoConstraints: MediaTrackConstraints | undefined;
      audioConstraints: MediaTrackConstraints | undefined;
    },
    state: DeviceManagerState,
  ) => void;
  managerInitialized: (event: { audio?: DeviceState; video?: DeviceState }, state: DeviceManagerState) => void;
  devicesStarted: (
    event: {
      audio?: DeviceState & { restarting: boolean; constraints?: string | boolean };
      video?: DeviceState & { restarting: boolean; constraints?: string | boolean };
    },
    state: DeviceManagerState,
  ) => void;
  // todo: This event is never used.
  deviceReady: (event: { trackType: TrackType; stream: MediaStream }, state: DeviceManagerState) => void;
  devicesReady: (
    event: {
      video: DeviceState & { restarted: boolean };
      audio: DeviceState & { restarted: boolean };
    },
    state: DeviceManagerState,
  ) => void;
  deviceStopped: (event: { trackType: TrackType }, state: DeviceManagerState) => void;
  deviceEnabled: (event: { trackType: TrackType }, state: DeviceManagerState) => void;
  deviceDisabled: (event: { trackType: TrackType }, state: DeviceManagerState) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (event: any, state: DeviceManagerState) => void;
};

export type DeviceManagerState = {
  video: DeviceState;
  audio: DeviceState;
};

export type DeviceManagerStatus = "uninitialized" | "initializing" | "initialized" | "error";

export class DeviceManager extends (EventEmitter as new () => TypedEmitter<DeviceManagerEvents>) {
  private readonly defaultAudioConstraints: MediaTrackConstraints | undefined;
  private readonly defaultVideoConstraints: MediaTrackConstraints | undefined;
  private readonly defaultStorageConfig: StorageConfig;

  private audioConstraints: MediaTrackConstraints | undefined;
  private videoConstraints: MediaTrackConstraints | undefined;
  private storageConfig: StorageConfig | undefined;

  private status: DeviceManagerStatus = "uninitialized";

  public video: DeviceState = {
    media: null,
    mediaStatus: "Not requested",
    devices: null,
    devicesStatus: "Not requested",
    error: null,
  };

  public audio: DeviceState = {
    media: null,
    mediaStatus: "Not requested",
    devices: null,
    devicesStatus: "Not requested",
    error: null,
  };

  constructor(defaultConfig?: DeviceManagerConfig) {
    super();
    this.defaultStorageConfig = this.createStorageConfig(defaultConfig?.storage);

    this.defaultAudioConstraints = defaultConfig?.audioTrackConstraints
      ? toMediaTrackConstraints(defaultConfig.audioTrackConstraints)
      : undefined;
    this.defaultVideoConstraints = defaultConfig?.videoTrackConstraints
      ? toMediaTrackConstraints(defaultConfig.videoTrackConstraints)
      : undefined;
  }

  private createStorageConfig(storage: boolean | StorageConfig | undefined): StorageConfig {
    if (storage === false) return DISABLE_STORAGE_CONFIG;
    if (storage === true || storage === undefined) return LOCAL_STORAGE_CONFIG;
    return storage;
  }

  private getVideoConstraints(
    currentConstraints: boolean | MediaTrackConstraints | undefined,
  ): MediaTrackConstraints | undefined {
    if (currentConstraints === false) return undefined;

    if (currentConstraints === undefined || currentConstraints === true)
      return this.videoConstraints ?? this?.defaultVideoConstraints;

    return currentConstraints ?? this.videoConstraints ?? this?.defaultVideoConstraints;
  }

  private getAudioConstraints(
    currentConstraints: boolean | MediaTrackConstraints | undefined,
  ): MediaTrackConstraints | undefined {
    if (currentConstraints === false) return undefined;

    if (currentConstraints === undefined || currentConstraints === true)
      return this.audioConstraints ?? this?.defaultAudioConstraints;

    return currentConstraints ?? this.audioConstraints ?? this?.defaultAudioConstraints;
  }

  public getStatus(): DeviceManagerStatus {
    return this.status;
  }

  public async init(config?: DeviceManagerInitConfig): Promise<"initialized" | "error"> {
    if (this.status !== "uninitialized") {
      return Promise.reject("Device manager already initialized");
    }
    this.status = "initializing";

    if (!navigator?.mediaDevices) {
      console.error("Cannot initialize DeviceManager. Navigator is available only in secure contexts");
      return Promise.resolve("error");
    }

    const videoTrackConstraints = this.getVideoConstraints(config?.videoTrackConstraints);
    const audioTrackConstraints = this.getAudioConstraints(config?.audioTrackConstraints);

    const previousVideoDevice: MediaDeviceInfo | null = this.getLastVideoDevice() ?? null;
    const previousAudioDevice: MediaDeviceInfo | null = this.getLastAudioDevice() ?? null;

    const shouldAskForVideo = !!videoTrackConstraints;
    const shouldAskForAudio = !!audioTrackConstraints;

    this.video.devicesStatus =
      shouldAskForVideo && videoTrackConstraints ? REQUESTING : this.video.devicesStatus ?? NOT_REQUESTED;
    this.audio.devicesStatus =
      shouldAskForAudio && audioTrackConstraints ? REQUESTING : this.audio.devicesStatus ?? NOT_REQUESTED;

    this.video.mediaStatus = this.video.devicesStatus;
    this.audio.mediaStatus = this.audio.devicesStatus;

    this.emit(
      "managerStarted",
      { trackType: "audiovideo", videoConstraints: videoTrackConstraints, audioConstraints: audioTrackConstraints },
      {
        audio: this.audio,
        video: this.video,
      },
    );

    let requestedDevices: MediaStream | null = null;
    const constraints = {
      video: shouldAskForVideo && getExactDeviceConstraint(videoTrackConstraints, previousVideoDevice?.deviceId),
      audio: shouldAskForAudio && getExactDeviceConstraint(audioTrackConstraints, previousAudioDevice?.deviceId),
    };

    let result: GetMedia = await getMedia(constraints, {});

    if (result.type === "Error" && result.error?.name === "NotFoundError") {
      result = await handleNotFoundError(constraints);
    }

    if (result.type === "Error" && result.error?.name === "OverconstrainedError") {
      result = await handleOverconstrainedError(result.constraints);
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
        currentDevices,
      );
      if (shouldCorrectDevices) {
        const videoIdToStart = mediaDeviceInfos.find((info) => info.label === previousVideoDevice?.label)?.deviceId;
        const audioIdToStart = mediaDeviceInfos.find((info) => info.label === previousAudioDevice?.label)?.deviceId;

        if (videoIdToStart || audioIdToStart) {
          stopTracks(requestedDevices);

          const exactConstraints: MediaStreamConstraints = {
            video: !!result.constraints.video && prepareConstraints(videoIdToStart, videoTrackConstraints),
            audio: !!result.constraints.video && prepareConstraints(audioIdToStart, audioTrackConstraints),
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
      shouldAskForVideo,
    );

    const audio: DeviceState = prepareDeviceState(
      requestedDevices,
      requestedDevices?.getAudioTracks()[0] || null,
      mediaDeviceInfos.filter(isAudio),
      getError(result, "audio"),
      shouldAskForAudio,
    );

    this.video = video;
    this.audio = audio;

    if (video.media?.deviceInfo) {
      this.saveLastVideoDevice(video.media?.deviceInfo);
    }

    if (audio.media?.deviceInfo) {
      this.saveLastAudioDevice(audio.media?.deviceInfo);
    }

    this.setupOnEndedCallback();

    this.emit("managerInitialized", { audio, video }, { audio: this.audio, video: this.video });
    return Promise.resolve("initialized");
  }

  private setupOnEndedCallback() {
    if (this.video?.media?.track) {
      this.video.media.track.addEventListener(
        "ended",
        async (event) => await this.onTrackEnded("video", (event.target as MediaStreamTrack).id),
      );
    }

    if (this.audio?.media?.track) {
      this.audio.media.track.addEventListener(
        "ended",
        async (event) => await this.onTrackEnded("audio", (event.target as MediaStreamTrack).id),
      );
    }
  }

  private onTrackEnded = async (type: AudioOrVideoType, trackId: string) => {
    if (trackId === this?.[type].media?.track?.id) {
      await this.stop(type);
    }
  };

  private getLastVideoDevice(): MediaDeviceInfo | null {
    return this.storageConfig?.getLastVideoDevice?.() ?? this.defaultStorageConfig?.getLastVideoDevice?.() ?? null;
  }

  private saveLastVideoDevice(info: MediaDeviceInfo) {
    if (this.storageConfig?.saveLastVideoDevice) {
      this.storageConfig.saveLastVideoDevice(info);
    } else {
      this.defaultStorageConfig.saveLastVideoDevice?.(info);
    }
  }

  private saveLastAudioDevice(info: MediaDeviceInfo) {
    if (this.storageConfig?.saveLastAudioDevice) {
      this.storageConfig.saveLastAudioDevice(info);
    } else {
      this.defaultStorageConfig.saveLastAudioDevice?.(info);
    }
  }

  private getLastAudioDevice(): MediaDeviceInfo | null {
    return this.storageConfig?.getLastAudioDevice?.() ?? this.defaultStorageConfig?.getLastAudioDevice?.() ?? null;
  }

  // todo `audioDeviceId / videoDeviceId === true` means use last device
  public async start({ audioDeviceId, videoDeviceId }: DeviceManagerStartConfig) {
    const shouldRestartVideo = !!videoDeviceId && videoDeviceId !== this.video.media?.deviceInfo?.deviceId;
    const shouldRestartAudio = !!audioDeviceId && audioDeviceId !== this.audio.media?.deviceInfo?.deviceId;

    const newVideoDevice = videoDeviceId === true ? this.getLastVideoDevice?.()?.deviceId || true : videoDeviceId;
    const newAudioDevice = audioDeviceId === true ? this.getLastAudioDevice?.()?.deviceId || true : audioDeviceId;

    const videoTrackConstraints = this.getVideoConstraints(true);
    const audioTrackConstraints = this.getAudioConstraints(true);

    const exactConstraints: MediaStreamConstraints = {
      video: shouldRestartVideo && prepareMediaTrackConstraints(newVideoDevice, videoTrackConstraints),
      audio: shouldRestartAudio && prepareMediaTrackConstraints(newAudioDevice, audioTrackConstraints),
    };

    if (!exactConstraints.video && !exactConstraints.audio) return;

    if (exactConstraints.audio) {
      this.audio.mediaStatus = "Requesting";
    }

    if (exactConstraints.video) {
      this.video.mediaStatus = "Requesting";
    }

    this.emit(
      "devicesStarted",
      {
        audio: { ...this.audio, restarting: shouldRestartAudio, constraints: audioDeviceId },
        video: { ...this.video, restarting: shouldRestartVideo, constraints: videoDeviceId },
      },
      { audio: this.audio, video: this.video },
    );

    const result = await getMedia(exactConstraints, {});

    if (result.type === "OK") {
      const stream = result.stream;

      const currentVideoDeviceId = result.stream.getVideoTracks()?.[0]?.getSettings()?.deviceId;
      const videoInfo = currentVideoDeviceId ? getDeviceInfo(currentVideoDeviceId, this.video.devices ?? []) : null;
      if (videoInfo) {
        this.saveLastVideoDevice?.(videoInfo);
      }

      const currentAudioDeviceId = result.stream.getAudioTracks()?.[0]?.getSettings()?.deviceId;
      const audioInfo = currentAudioDeviceId ? getDeviceInfo(currentAudioDeviceId, this.audio.devices ?? []) : null;

      if (audioInfo) {
        this.saveLastAudioDevice(audioInfo);
      }

      // The device manager assumes that there is only one audio and video track.
      // All previous tracks are deactivated even if the browser is able to handle multiple active sessions. (Chrome, Firefox)
      //
      // Safari always deactivates the track and emits the `ended` event.
      // Its handling is asynchronous and can be executed even before returning a value from the re-execution of `getUserMedia`.
      // In such a case, the tracks are already deactivated at this point (logic in `onTrackEnded` method).
      // The track is null, so the stop method will not execute.
      //
      // However, if Safari has not yet handled this event, the tracks are manually stopped at this point.
      // Manually stopping tracks on its own does not generate the `ended` event.
      // The ended event in Safari has already been emitted and will be handled in the future.
      // Therefore, in the `onTrackEnded` method, events for already stopped tracks are filtered out to prevent the state from being damaged.
      if (shouldRestartVideo) {
        this.video?.media?.track?.stop();
      }

      if (shouldRestartAudio) {
        this.audio?.media?.track?.stop();
      }

      const videoMedia: Media | null = shouldRestartVideo
        ? {
            stream: stream,
            track: stream.getVideoTracks()[0] || null,
            deviceInfo: videoInfo,
            enabled: true,
          }
        : this.video.media;

      const audioMedia: Media | null = shouldRestartAudio
        ? {
            stream: stream,
            track: stream.getAudioTracks()[0] || null,
            deviceInfo: audioInfo,
            enabled: true,
          }
        : this.audio.media;

      this.video.media = videoMedia;
      this.audio.media = audioMedia;

      this.setupOnEndedCallback();

      if (exactConstraints.audio) {
        this.audio.mediaStatus = "OK";
      }

      if (exactConstraints.video) {
        this.video.mediaStatus = "OK";
      }

      this.emit(
        "devicesReady",
        {
          video: { ...this.video, restarted: shouldRestartVideo },
          audio: { ...this.audio, restarted: shouldRestartAudio },
        },
        { audio: this.audio, video: this.video },
      );
    } else {
      const parsedError = result.error;

      const event = {
        parsedError,
        constraints: exactConstraints,
      };

      const videoError = exactConstraints.video ? parsedError : this.video.error;
      const audioError = exactConstraints.audio ? parsedError : this.audio.error;

      this.video.error = videoError;
      this.audio.error = audioError;

      this.emit("error", event, { audio: this.audio, video: this.video });
    }
  }

  public async stop(type: AudioOrVideoType) {
    this[type].media?.track?.stop();
    this[type].media = null;

    this.emit("deviceStopped", { trackType: type }, { audio: this.audio, video: this.video });
  }

  public setEnable(type: AudioOrVideoType, value: boolean) {
    if (!this[type].media || !this[type].media?.track) {
      return;
    }

    this[type!].media!.track!.enabled = value;
    this[type!].media!.enabled = value;

    if (value) {
      this.emit("deviceEnabled", { trackType: type }, { audio: this.audio, video: this.video });
    } else {
      this.emit("deviceDisabled", { trackType: type }, { audio: this.audio, video: this.video });
    }
  }

  public setConfig(config?: DeviceManagerConfig) {
    this.storageConfig = this.createStorageConfig(config?.storage);
    this.audioConstraints = config?.audioTrackConstraints
      ? toMediaTrackConstraints(config.audioTrackConstraints)
      : undefined;
    this.videoConstraints = config?.videoTrackConstraints
      ? toMediaTrackConstraints(config.videoTrackConstraints)
      : undefined;
  }
}
