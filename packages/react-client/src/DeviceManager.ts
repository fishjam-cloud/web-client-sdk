import type { DeviceState, MediaManager, DeviceError, DeviceManagerStatus } from "./types/internal";

import { prepareMediaTrackConstraints } from "./constraints";

import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import { getDeviceInfo, getLocalStorageConfig, prepareDeviceState } from "./utils/media";
import { parseUserMediaError } from "./utils/errors";
import type { PersistLastDeviceHandlers } from "./types/public";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (event: any, state: DeviceState) => void;
};

export type DeviceManagerConfig = {
  deviceType: "audio" | "video";
  defaultConstraints: MediaTrackConstraints;
  userConstraints?: boolean | MediaTrackConstraints;
  storage?: boolean | PersistLastDeviceHandlers;
};

export class DeviceManager
  extends (EventEmitter as new () => TypedEmitter<DeviceManagerEvents>)
  implements MediaManager
{
  private readonly constraints: boolean | MediaTrackConstraints;
  private readonly storageConfig: PersistLastDeviceHandlers | null;

  private status: DeviceManagerStatus = "uninitialized";
  private readonly deviceType: "audio" | "video";

  public deviceState: DeviceState = {
    media: null,
    mediaStatus: "Not requested",
    devices: null,
    devicesStatus: "Not requested",
    error: null,
  };

  constructor({ deviceType, storage, userConstraints, defaultConstraints }: DeviceManagerConfig) {
    super();
    this.storageConfig = this.createStorageConfig(deviceType, storage);
    this.deviceType = deviceType;
    this.constraints = userConstraints ?? defaultConstraints;
  }

  private createStorageConfig(
    deviceType: "audio" | "video",
    storage?: boolean | PersistLastDeviceHandlers,
  ): PersistLastDeviceHandlers | null {
    if (storage === false) return null;
    if (storage === true || storage === undefined) return getLocalStorageConfig(deviceType);
    return storage;
  }

  public getStatus(): DeviceManagerStatus {
    return this.status;
  }

  public getConstraints(): MediaTrackConstraints | boolean {
    return this.constraints;
  }

  public getMedia = () => this.deviceState.media;

  public getTracks = () => {
    const stream = this.deviceState.media?.stream;
    if (this.deviceType === "audio") {
      return stream?.getAudioTracks() ?? [];
    }
    return stream?.getVideoTracks() ?? [];
  };

  public initialize = (
    stream: MediaStream | null,
    track: MediaStreamTrack | null,
    devices: MediaDeviceInfo[],
    requestedMedia: boolean,
    error: DeviceError | null = null,
  ) => {
    this.deviceState = prepareDeviceState(stream, track, devices, error, requestedMedia);

    const deviceInfo = this.deviceState.media?.deviceInfo;
    if (deviceInfo) this.saveLastDevice(deviceInfo);

    this.status = "initialized";
    this.setupOnEndedCallback();

    this.emit("managerInitialized", this.deviceState);

    return this.deviceState;
  };

  private setupOnEndedCallback() {
    if (this.deviceState?.media?.track) {
      this.deviceState.media.track.addEventListener(
        "ended",
        async (event) => await this.onTrackEnded((event.target as MediaStreamTrack).id),
      );
    }
  }

  private onTrackEnded = async (trackId: string) => {
    if (trackId === this?.deviceState.media?.track?.id) {
      await this.stop();
    }
  };

  public getLastDevice(): MediaDeviceInfo | null {
    return this.storageConfig?.getLastDevice?.() ?? null;
  }

  private saveLastDevice(info: MediaDeviceInfo) {
    this.storageConfig?.saveLastDevice(info);
  }

  public async start(deviceId?: string) {
    const newDeviceId: string | undefined = deviceId ?? this.getLastDevice()?.deviceId;
    const currentDeviceId = this.deviceState.media?.deviceInfo?.deviceId;

    const shouldReplaceDevice = Boolean(currentDeviceId && currentDeviceId !== newDeviceId);
    const isDeviceStopped = currentDeviceId === undefined;
    const shouldProceed = isDeviceStopped || shouldReplaceDevice;

    const exactConstraints = shouldProceed && prepareMediaTrackConstraints(newDeviceId, this.constraints);
    if (!exactConstraints) return;

    this.deviceState.mediaStatus = "Requesting";

    this.emit(
      "devicesStarted",
      { ...this.deviceState, restarting: shouldReplaceDevice, constraints: exactConstraints },
      this.deviceState,
    );

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ [this.deviceType]: exactConstraints });

      const getTrack = (): MediaStreamTrack | null => {
        const tracks = this.deviceType === "audio" ? stream.getAudioTracks() : stream.getVideoTracks();

        return tracks[0] ?? null;
      };

      const track = getTrack();

      const currentDeviceId = track?.getSettings()?.deviceId;
      const deviceInfo = currentDeviceId ? getDeviceInfo(currentDeviceId, this.deviceState.devices ?? []) : null;

      if (deviceInfo) {
        this.saveLastDevice?.(deviceInfo);
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
      if (shouldReplaceDevice) {
        this.deviceState?.media?.track?.stop();
      }

      this.deviceState.media = {
        stream,
        track,
        deviceInfo,
        enabled: true,
      };

      this.setupOnEndedCallback();

      this.deviceState.mediaStatus = "OK";

      this.emit("devicesReady", { ...this.deviceState, restarted: shouldReplaceDevice }, this.deviceState);
    } catch (err) {
      const parsedError = parseUserMediaError(err);
      const event = {
        parsedError,
        constraints: exactConstraints,
      };

      if (exactConstraints) {
        this.deviceState.error = parsedError;
      }

      this.emit("error", event, this.deviceState);
    }
  }

  public async stop() {
    this.deviceState.media?.track?.stop();
    this.deviceState.media = null;

    this.emit("deviceStopped", this.deviceState);
  }

  public disable() {
    if (!this.deviceState.media || !this.deviceState.media?.track) {
      return;
    }

    this.deviceState.media!.track!.enabled = false;
    this.deviceState.media!.enabled = false;

    this.emit("deviceDisabled", this.deviceState);
  }

  public enable() {
    if (!this.deviceState.media || !this.deviceState.media?.track) {
      return;
    }

    this.deviceState.media!.track!.enabled = true;
    this.deviceState.media!.enabled = true;

    this.emit("deviceEnabled", this.deviceState);
  }

  public getDeviceType = () => {
    return this.deviceType;
  };
}
