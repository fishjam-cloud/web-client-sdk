import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import type { AudioOrVideoType, DeviceError, DevicesStatus } from "./types";
import { parseError } from "./types";

export type TrackType = "audio" | "video" | "audiovideo";
export type MediaDeviceType = "displayMedia" | "userMedia";

export type DisplayMediaManagerEvents = {
  deviceReady: (event: { type: TrackType }, state: ScreenShareDeviceState) => void;
  deviceStopped: (event: { type: TrackType }, state: ScreenShareDeviceState) => void;
  deviceEnabled: (event: { type: TrackType }, state: ScreenShareDeviceState) => void;
  deviceDisabled: (event: { type: TrackType }, state: ScreenShareDeviceState) => void;
  error: (
    event: {
      type: TrackType;
      error: DeviceError | null;
      rawError: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    },
    state: ScreenShareDeviceState,
  ) => void;
};

export interface ScreenShareManagerConfig {
  audioTrackConstraints?: boolean | MediaTrackConstraints;
  videoTrackConstraints?: boolean | MediaTrackConstraints;
}

export type ScreenShareMedia = {
  stream: MediaStream | null;
  track: MediaStreamTrack | null;
  enabled: boolean;
};

export type ScreenShareDeviceState = {
  status: DevicesStatus;
  audioMedia: ScreenShareMedia | null;
  videoMedia: ScreenShareMedia | null;
  error: DeviceError | null;
};

export class ScreenShareManager extends (EventEmitter as new () => TypedEmitter<DisplayMediaManagerEvents>) {
  private readonly defaultConfig?: ScreenShareManagerConfig;
  private config?: ScreenShareManagerConfig;

  private data: ScreenShareDeviceState = {
    audioMedia: null,
    videoMedia: null,
    status: "Not requested",
    error: null,
  };

  // todo add nested read only
  public getSnapshot(): ScreenShareDeviceState {
    return this.data;
  }

  constructor(defaultConfig?: ScreenShareManagerConfig) {
    super();
    this.defaultConfig = defaultConfig;
  }

  public setConfig(config: ScreenShareManagerConfig) {
    this.config = config;
  }

  private getType(options: DisplayMediaStreamOptions): TrackType | null {
    if (options.audio && options.video) return "audiovideo";
    if (options.audio) return "audio";
    if (options.video) return "video";
    return null;
  }

  public async start(config?: ScreenShareManagerConfig) {
    const options: DisplayMediaStreamOptions = {
      video:
        config?.videoTrackConstraints ??
        this.config?.videoTrackConstraints ??
        this.defaultConfig?.videoTrackConstraints,
      audio:
        config?.audioTrackConstraints ??
        this.config?.audioTrackConstraints ??
        this.defaultConfig?.audioTrackConstraints,
    };

    const type = this.getType(options);
    if (!type) return;

    try {
      const newStream = await navigator.mediaDevices.getDisplayMedia(options);

      this.data = {
        error: null,
        videoMedia: {
          enabled: true,
          stream: newStream,
          track: newStream?.getVideoTracks()[0] ?? null,
        },
        audioMedia: {
          enabled: true,
          stream: newStream,
          track: newStream?.getAudioTracks()[0] ?? null,
        },
        status: "OK",
      };

      this.setupOnEndedCallback();

      this.emit("deviceReady", { type: type }, this.data);
    } catch (error: unknown) {
      const parsedError: DeviceError | null = parseError(error);
      this.emit("error", { type, error: parsedError, rawError: error }, this.data);
    }
  }

  private setupOnEndedCallback() {
    if (this.data.videoMedia?.track) {
      this.data.videoMedia.track.addEventListener(
        "ended",
        async (event) => await this.onTrackEnded("video", (event.target as MediaStreamTrack).id),
      );
    }

    if (this.data.audioMedia?.track) {
      this.data.audioMedia.track.addEventListener(
        "ended",
        async (event) => await this.onTrackEnded("audio", (event.target as MediaStreamTrack).id),
      );
    }
  }

  private onTrackEnded = async (type: AudioOrVideoType, trackId: string) => {
    const mediaType = type === "video" ? "videoMedia" : "audioMedia";
    if (trackId === this?.data[mediaType]?.track?.id) {
      await this.stop("audiovideo");
    }
  };

  public async stop(type: TrackType) {
    if (type === "video") {
      for (const track of this.data?.videoMedia?.stream?.getTracks() ?? []) {
        track.stop();
      }
      this.data.videoMedia = null;
    } else if (type === "audio") {
      // todo test it
      for (const track of this.data?.audioMedia?.stream?.getTracks() ?? []) {
        track.stop();
      }
      this.data.audioMedia = null;
    } else {
      for (const track of this.data?.videoMedia?.stream?.getTracks() ?? []) {
        track.stop();
      }
      this.data.videoMedia = null;

      for (const track of this.data?.audioMedia?.stream?.getTracks() ?? []) {
        track.stop();
      }
      this.data.audioMedia = null;
    }

    this.emit("deviceStopped", { type }, this.data);
  }

  public setEnable(type: TrackType, value: boolean) {
    if (type === "video" && this.data.videoMedia?.track) {
      this.data.videoMedia.track.enabled = value;
      this.data.videoMedia.enabled = value;
    } else if (type === "audio" && this.data.audioMedia?.track) {
      this.data.audioMedia.track.enabled = value;
      this.data.audioMedia.enabled = value;
    } else {
      if (this.data.videoMedia?.track) {
        this.data.videoMedia.track.enabled = value;
        this.data.videoMedia.enabled = value;
      }
      if (this.data.audioMedia?.track) {
        this.data.audioMedia.track.enabled = value;
        this.data.audioMedia.enabled = value;
      }
    }

    if (value) {
      this.emit("deviceEnabled", { type }, this.data);
    } else {
      this.emit("deviceDisabled", { type }, this.data);
    }
  }
}
