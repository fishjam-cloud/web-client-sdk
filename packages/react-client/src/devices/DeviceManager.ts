import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";

import type {
  DeviceManagerStatus,
  DevicesStatus,
  DeviceState,
  Media,
  MediaManager,
  MediaStatus,
} from "../types/internal";
import type { DeviceError, DeviceType, PersistLastDeviceHandlers, TrackMiddleware } from "../types/public";
import { parseUserMediaError } from "../utils/errors";
import { createStorageConfig } from "../utils/localStorage";
import { setupOnEndedCallback } from "../utils/track";
import { prepareMediaTrackConstraints } from "./constraints";
import { MiddlewareManager } from "./MiddlewareManager";

export type DeviceManagerEvents = {
  managerStarted: (
    event: DeviceState & {
      constraints: MediaTrackConstraints | undefined;
    },
    state: DeviceState,
  ) => void;
  managerInitialized: (state: DeviceState) => void;
  devicesStarted: (
    event: { restarting: boolean; constraints?: MediaTrackConstraints | boolean },
    state: DeviceState,
  ) => void;
  deviceReady: (event: { stream: MediaStream }, state: DeviceState) => void;
  devicesReady: (event: DeviceState & { restarted: boolean }, state: DeviceState) => void;
  deviceStopped: (state: DeviceState) => void;
  deviceEnabled: (state: DeviceState) => void;
  deviceDisabled: (state: DeviceState) => void;
  middlewareSet: (state: DeviceState) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (event: any, state: DeviceState) => void;
  initializedWithError: (state: DeviceState) => void;
};

export type DeviceManagerConfig = {
  deviceType: DeviceType;
  defaultConstraints: MediaTrackConstraints;
  userConstraints?: boolean | MediaTrackConstraints;
  storage?: boolean | PersistLastDeviceHandlers;
};

const NOOP = () => {};

export class DeviceManager
  extends (EventEmitter as new () => TypedEmitter<DeviceManagerEvents>)
  implements MediaManager
{
  private readonly constraints: boolean | MediaTrackConstraints;

  private status: DeviceManagerStatus = "uninitialized";
  private readonly deviceType: DeviceType;
  private readonly middlewareManager = new MiddlewareManager();

  public readonly getLastDevice: () => MediaDeviceInfo | null = () => null;
  private readonly saveLastDevice: (info: MediaDeviceInfo) => void = NOOP;

  private rawMedia: Media | null = null;

  private processedMediaTrack: MediaStreamTrack | null = null;

  private media: Media | null = null;

  private mediaStatus: MediaStatus = "Not requested";
  private devices: MediaDeviceInfo[] | null = null;
  private devicesStatus: DevicesStatus = "Not requested";
  private error: DeviceError | null = null;

  constructor({ deviceType, storage, userConstraints, defaultConstraints }: DeviceManagerConfig) {
    super();
    const storageConfig = createStorageConfig(deviceType, storage);
    if (storageConfig) {
      this.getLastDevice = storageConfig.getLastDevice;
      this.saveLastDevice = storageConfig.saveLastDevice;
    }

    this.deviceType = deviceType;
    this.constraints = userConstraints ?? defaultConstraints;
  }

  public getState(): DeviceState {
    return {
      mediaStatus: this.mediaStatus,
      devices: this.devices,
      devicesStatus: this.devicesStatus,
      error: this.error,
      media: this.media,
      currentMiddleware: this.middlewareManager.getMiddleware(),
    };
  }

  public getStatus(): DeviceManagerStatus {
    return this.status;
  }

  public getConstraints(): MediaTrackConstraints | boolean {
    return this.constraints;
  }

  public getDeviceType = () => {
    return this.deviceType;
  };

  public getMedia = (): Media | null => {
    return this.media;
  };

  public initialize = (
    stream: MediaStream | null,
    track: MediaStreamTrack | null,
    devices: MediaDeviceInfo[],
    requestedMedia: boolean,
    error: DeviceError | null = null,
  ) => {
    const deviceInfo = getDeviceInfo(track?.getSettings()?.deviceId || null, devices);
    const [devicesStatus, newError] = prepareStatus(requestedMedia, track);

    this.devices = devices;
    this.devicesStatus = devicesStatus;
    this.mediaStatus = devicesStatus;
    this.error = newError ?? error;

    if (this.error) {
      this.emit("initializedWithError", this.getState());
    }

    this.updateMedia({
      stream: track ? stream : null,
      track,
      deviceInfo,
      enabled: Boolean(track?.enabled),
    });

    if (deviceInfo) this.saveLastDevice?.(deviceInfo);

    this.status = "initialized";

    if (track) {
      setupOnEndedCallback(
        track,
        () => this?.rawMedia?.track?.id,
        async () => this.stop(),
      );
    }

    this.emit("managerInitialized", this.getState());
  };

  public async start(deviceId?: string) {
    const newDeviceId: string | undefined = deviceId ?? this.getLastDevice?.()?.deviceId;
    const currentDeviceId = this.rawMedia?.deviceInfo?.deviceId;

    const shouldReplaceDevice = Boolean(currentDeviceId && currentDeviceId !== newDeviceId);
    const isDeviceStopped = currentDeviceId === undefined;
    const shouldProceed = isDeviceStopped || shouldReplaceDevice;

    const exactConstraints = shouldProceed && prepareMediaTrackConstraints(newDeviceId, this.constraints);
    if (!exactConstraints) return;

    this.mediaStatus = "Requesting";

    this.emit("devicesStarted", { restarting: shouldReplaceDevice, constraints: exactConstraints }, this.getState());

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ [this.deviceType]: exactConstraints });
      const track = getTrack(stream, this.deviceType);

      const trackDeviceId = track?.getSettings()?.deviceId;
      const deviceInfo = trackDeviceId ? getDeviceInfo(trackDeviceId, this.devices ?? []) : null;

      if (deviceInfo) {
        this.saveLastDevice?.(deviceInfo);
      }

      this.rawMedia?.track?.stop();
      this.processedMediaTrack?.stop();

      this.updateMedia({
        stream,
        track,
        deviceInfo,
        enabled: Boolean(track?.enabled),
      });

      if (track) {
        setupOnEndedCallback(
          track,
          () => this?.rawMedia?.track?.id,
          async () => this.stop(),
        );
      }

      this.mediaStatus = "OK";

      this.emit("devicesReady", { ...this.getState(), restarted: shouldReplaceDevice }, this.getState());
    } catch (err) {
      const parsedError = parseUserMediaError(err);
      const event = {
        parsedError,
        constraints: exactConstraints,
      };

      this.error = parsedError;
      this.emit("error", event, this.getState());
    }
  }

  public async setTrackMiddleware(middleware: TrackMiddleware | null): Promise<void> {
    const rawTrack = this.rawMedia?.track ?? null;
    const processedMedia = this.middlewareManager.applyMiddleware(rawTrack, middleware);

    this.setCurrentMedia(this.rawMedia, processedMedia);

    this.emit("middlewareSet", this.getState());
  }

  public getMiddleware(): TrackMiddleware | null {
    return this.middlewareManager.getMiddleware();
  }

  public stop() {
    this.middlewareManager.clearMiddleware();
    this.processedMediaTrack?.stop();
    this.rawMedia?.track?.stop();
    this.media?.track?.stop();

    this.updateMedia(null);

    this.emit("deviceStopped", this.getState());
  }

  public disable() {
    this.setEnable(this.rawMedia?.track ?? null, false);
    this.setEnable(this.processedMediaTrack, false);

    if (this.media) {
      this.media.enabled = false;
    }

    this.emit("deviceDisabled", this.getState());
  }

  public enable() {
    this.setEnable(this.rawMedia?.track ?? null, true);
    this.setEnable(this.processedMediaTrack, true);

    if (this.media) {
      this.media.enabled = true;
    }

    this.emit("deviceEnabled", this.getState());
  }

  private setEnable = (track: MediaStreamTrack | null, value: boolean) => {
    if (!track) return;
    track.enabled = value;
  };

  private updateMedia(media: Media | null) {
    this.rawMedia = !media ? null : { ...media };

    const processedMedia = this.middlewareManager.applyMiddleware(media?.track ?? null);
    this.setCurrentMedia(this.rawMedia, processedMedia);
  }

  private setCurrentMedia(media: Media | null, processedTrack: MediaStreamTrack | null) {
    this.processedMediaTrack = processedTrack;

    const streamTrack = processedTrack ? { track: processedTrack, stream: new MediaStream([processedTrack]) } : media;

    this.media = streamTrack
      ? {
          ...streamTrack,
          enabled: Boolean(streamTrack.track?.enabled),
          deviceInfo: this.rawMedia?.deviceInfo ?? null,
        }
      : null;
  }
}

function getDeviceInfo(trackDeviceId: string | null, devices: MediaDeviceInfo[]): MediaDeviceInfo | null {
  return (trackDeviceId && devices.find(({ deviceId }) => trackDeviceId === deviceId)) || null;
}

function getTrack(stream: MediaStream | undefined | null, deviceType: DeviceType): MediaStreamTrack | null {
  return (deviceType === "audio" ? stream?.getAudioTracks()?.[0] : stream?.getVideoTracks()?.[0]) ?? null;
}

function prepareStatus(requested: boolean, track: MediaStreamTrack | null): [DevicesStatus, DeviceError | null] {
  if (!requested) return ["Not requested", null];
  if (track) return ["OK", null];
  return ["Error", null];
}
