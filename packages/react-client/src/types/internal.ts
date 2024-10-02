import type { SimulcastConfig, TrackBandwidthLimit } from "@fishjam-cloud/ts-client";
import type { Track, TrackMiddleware, TracksMiddleware } from "./public";

export type TrackId = string;
export type PeerId = string;

export type PeerState = {
  id: PeerId;
  metadata: {
    peer?: PeerMetadata;
    server: Record<string, unknown>;
  };
  tracks: Record<TrackId, Track>;
};

// todo change to Inner / Hidden metadata
export type PeerMetadata = {
  displayName?: string;
};

export type TrackMetadata = {
  type: "camera" | "microphone" | "screenShareVideo" | "screenShareAudio";
  paused: boolean;
  // track label used in recordings
  displayName?: string;
};

export type DevicesStatus = "OK" | "Error" | "Not requested" | "Requesting";
export type MediaStatus = "OK" | "Error" | "Not requested" | "Requesting";

export type DeviceManagerStatus = "uninitialized" | "initializing" | "initialized" | "error";

export interface DeviceManagerState {
  deviceState: DeviceState;
  status: DeviceManagerStatus;
  tracks: MediaStreamTrack[];
}

export type Media = {
  stream: MediaStream | null;
  track: MediaStreamTrack | null;
  enabled: boolean;
  deviceInfo: MediaDeviceInfo | null;
};

export type DeviceState = {
  media: Media | null;
  mediaStatus: MediaStatus;
  devices: MediaDeviceInfo[] | null;
  devicesStatus: DevicesStatus;
  error: DeviceError | null;
};

export type MediaState = {
  video: DeviceState;
  audio: DeviceState;
};

export type DeviceManagerInitConfig = {
  videoTrackConstraints?: boolean | MediaTrackConstraints;
  audioTrackConstraints?: boolean | MediaTrackConstraints;
};

export type DeviceManagerStartConfig = {
  audioDeviceId?: string | boolean;
  videoDeviceId?: string | boolean;
};

export type DeviceError =
  | { name: "OverconstrainedError" }
  | { name: "NotAllowedError" }
  | { name: "NotFoundError" }
  | { name: "UNHANDLED_ERROR" };

export type CurrentDevices = { videoinput: MediaDeviceInfo | null; audioinput: MediaDeviceInfo | null };

export interface MediaManager {
  start: (deviceId?: string) => Promise<void>;
  stop: () => Promise<void>;
  disable: () => void;
  enable: () => void;
  getTracks: () => MediaStreamTrack[];
  getMedia: () => { stream: MediaStream | null; track: MediaStreamTrack | null; enabled: boolean } | null;
  getDeviceType: () => "audio" | "video";
}

export type ScreenShareState = (
  | {
      stream: MediaStream;
      trackIds: { videoId: string; audioId?: string };
    }
  | { stream: null; trackIds: null }
) & { tracksMiddleware?: TracksMiddleware | null };

export interface TrackManager {
  initialize: (deviceId?: string) => Promise<void>;
  stop: () => Promise<void>;
  startStreaming: (simulcastConfig?: SimulcastConfig, maxBandwidth?: TrackBandwidthLimit) => Promise<string>;
  stopStreaming: () => Promise<void>;
  pauseStreaming: () => Promise<void>;
  resumeStreaming: () => Promise<void>;
  paused: boolean;
  disableTrack: () => void;
  enableTrack: () => void;
  setTrackMiddleware: (middleware: TrackMiddleware) => Promise<void>;
  currentTrackMiddleware: TrackMiddleware;
  refreshStreamedTrack: () => Promise<void>;
  currentTrack: Track | null;

  /**
   * Either enables or disables the stream.
   *
   * - **Soft Mode** - Enables and disables the media stream. Starts the device if needed.
   *   - If enabled: disables the media stream and pauses streaming, but does not stop the device.
   *   - If disabled: enables the media stream and starts (or resumes) streaming.
   *   - If stopped: starts the device, enables the media stream, and starts (or resumes) streaming.
   */
  toggleMute: () => Promise<void>;
  /**
   * Either initiates or terminates the device.
   *
   * - **Hard Mode** - Turns the physical device on and off.
   *   - If started: disables the media stream, pauses streaming, and stops the device.
   *   - If stopped: starts the device and begins (or resumes) streaming.
   */
  toggleDevice: () => Promise<void>;
}

export type DistinguishedTracks = {
  cameraTrack?: Track;
  microphoneTrack?: Track;
  screenShareVideoTrack?: Track;
  screenShareAudioTrack?: Track;
};
