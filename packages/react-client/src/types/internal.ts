import type { Peer } from "@fishjam-cloud/ts-client";

import type { DeviceError, DeviceType, PeerId, Track, TrackMiddleware, TracksMiddleware } from "./public";

export type DevicesStatus = "OK" | "Error" | "Not requested" | "Requesting";
export type MediaStatus = "OK" | "Error" | "Not requested" | "Requesting";

export type DeviceManagerStatus = "uninitialized" | "initializing" | "initialized" | "error";

export interface DeviceManagerState {
  deviceState: DeviceState;
  deviceStatus: DeviceManagerStatus;
  deviceType: DeviceType;
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
  currentMiddleware: TrackMiddleware | null;
};

export type CurrentDevices = { videoinput: MediaDeviceInfo | null; audioinput: MediaDeviceInfo | null };

export interface MediaManager {
  start: (deviceId?: string) => Promise<void>;
  stop: () => void;
  disable: () => void;
  enable: () => void;
  setTrackMiddleware: (middleware: TrackMiddleware | null) => void;
  getMiddleware: () => TrackMiddleware | null;
  getMedia: () => { stream: MediaStream | null; track: MediaStreamTrack | null; enabled: boolean } | null;
  getDeviceType: () => DeviceType;
}

export type ScreenShareState = (
  | {
      stream: MediaStream;
      trackIds: { videoId: string; audioId?: string };
    }
  | { stream: null; trackIds: null }
) & { tracksMiddleware?: TracksMiddleware | null };

export interface TrackManager {
  selectDevice: (deviceId?: string) => Promise<void>;
  paused: boolean;
  setTrackMiddleware: (middleware: TrackMiddleware | null) => Promise<void>;
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

export type BrandedPeer<P, S> = Omit<Peer<P, S>, "id"> & { id: PeerId };
