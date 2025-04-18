import type { Peer } from "@fishjam-cloud/ts-client";

import type { DeviceError, PeerId, TrackMiddleware, TracksMiddleware } from "./public";

export type AudioVideo<T> = { audio: T; video: T };

export type CurrentDevices = { videoinput: MediaDeviceInfo | null; audioinput: MediaDeviceInfo | null };

export type ScreenShareState = (
  | {
      stream: MediaStream;
      trackIds: { videoId?: string; audioId?: string };
    }
  | { stream: null; trackIds: null }
) & { tracksMiddleware?: TracksMiddleware | null };

export type CustomSourceState = {
  trackIds: { videoId?: string; audioId?: string };
};

export interface TrackManager {
  selectDevice: (deviceId: string) => Promise<undefined | DeviceError>;
  deviceTrack: MediaStreamTrack | null;
  currentMiddleware: TrackMiddleware;
  setTrackMiddleware: (middleware: TrackMiddleware | null) => Promise<void>;
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
  toggleDevice: () => Promise<undefined | DeviceError>;
}

export type BrandedPeer<P, S> = Omit<Peer<P, S>, "id"> & { id: PeerId };
