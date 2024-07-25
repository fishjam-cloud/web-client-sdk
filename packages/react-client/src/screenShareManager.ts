import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import type { DeviceError, DevicesStatus } from "./types";
import { parseUserMediaError } from "./utils/errors";
import type { TrackKind } from "@fishjam-dev/ts-client";

export type TrackType = TrackKind | "audiovideo";
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

  private getType(options: DisplayMediaStreamOptions): TrackType | null {
    if (options.audio && options.video) return "audiovideo";
    if (options.audio) return "audio";
    if (options.video) return "video";
    return null;
  }

  public getMedia = () => ({ video: this.data.videoMedia, audio: this.data.audioMedia });

  public async start(withAudio?: boolean) {
    const options: DisplayMediaStreamOptions = {
      video: true,
      audio: withAudio,
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
      const parsedError: DeviceError | null = parseUserMediaError(error);
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

  private onTrackEnded = async (kind: TrackKind, trackId: string) => {
    const mediaType = kind === "video" ? "videoMedia" : "audioMedia";
    if (trackId === this?.data[mediaType]?.track?.id) {
      await this.stop("audiovideo");
    }
  };

  public async stop(type: TrackType) {
    if (type.includes("video")) {
      for (const track of this.data?.videoMedia?.stream?.getTracks() ?? []) {
        track.stop();
      }
      this.data.videoMedia = null;
    }
    if (type.includes("audio")) {
      for (const track of this.data?.audioMedia?.stream?.getTracks() ?? []) {
        track.stop();
      }
      this.data.audioMedia = null;
    }

    this.emit("deviceStopped", { type }, this.data);
  }

  public setEnable(type: TrackType, value: boolean) {
    if (type.includes("video") && this.data.videoMedia?.track) {
      this.data.videoMedia.track.enabled = value;
      this.data.videoMedia.enabled = value;
    }
    if (type.includes("audio") && this.data.audioMedia?.track) {
      this.data.audioMedia.track.enabled = value;
      this.data.audioMedia.enabled = value;
    }

    const eventName = value ? "deviceEnabled" : "deviceDisabled";
    this.emit(eventName, { type }, this.data);
  }
}
