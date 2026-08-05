import type { Peer } from "@fishjam-cloud/ts-client";

import type { DeviceError, DeviceItem, PeerId, TrackMiddleware, TracksMiddleware } from "./public";

export type AudioVideo<T> = { audio: T; video: T };

export type CurrentDevices = { videoinput: MediaDeviceInfo | null; audioinput: MediaDeviceInfo | null };

export type ScreenShareState = (
  | {
      stream: MediaStream;
      trackIds: { videoId?: string; audioId?: string };
    }
  | { stream: null; trackIds: null }
) & { tracksMiddleware?: TracksMiddleware | null };

export interface TrackManager {
  selectDevice: (deviceId: string) => Promise<undefined | DeviceError>;
  stopDevice: () => void;
  startDevice: (deviceId?: string | null) => Promise<[MediaStreamTrack, null] | [null, DeviceError]>;
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

export type CustomSourceTracks = {
  videoId?: string;
  audioId?: string;
};

export type CustomSourceState = {
  stream: MediaStream;
  trackIds?: CustomSourceTracks;
};

export type DeviceManager = {
  startDevice: (deviceId?: string | null) => Promise<[MediaStreamTrack, null] | [null, DeviceError]>;
  stopDevice: () => void;
  selectDevice: (deviceId: string) => Promise<[MediaStreamTrack, null] | [null, DeviceError]> | undefined;
  activeDevice: DeviceItem | null;
  deviceTrack: MediaStreamTrack | null;
  /** Render-ready stream containing `deviceTrack` — built by the platform device manager. */
  deviceStream: MediaStream | null;
  deviceList: DeviceItem[];
  deviceEnabled: boolean;
  enableDevice: () => void;
  disableDevice: () => void;
  currentMiddleware: TrackMiddleware;
  applyMiddleware: (middleware: TrackMiddleware) => Promise<MediaStreamTrack | null>;
  deviceError: DeviceError | null;
  selectedDevice: MediaDeviceInfo | null;
};

export type UseScreenshareResult = {
  /**
   * Invokes the screen sharing prompt in the user's browser and starts streaming upon approval.
   */
  startStreaming: (props?: {
    audioConstraints?: boolean | MediaTrackConstraints;
    videoConstraints?: boolean | MediaTrackConstraints;
  }) => Promise<void>;
  /**
   * Stops the stream and cancels browser screen sharing.
   */
  stopStreaming: () => Promise<void>;
  /**
   * The MediaStream object containing both tracks.
   */
  stream: MediaStream | null;
  /**
   * The separate video MediaStreamTrack.
   */
  videoTrack: MediaStreamTrack | null;
  /**
   * The separate audio MediaStreamTrack.
   */
  audioTrack: MediaStreamTrack | null;
  /**
   * The middleware currently assigned to process the tracks.
   * By default, the middleware function returns the original track.
   */
  currentTracksMiddleware: TracksMiddleware | null;
  /**
   * Sets a new middleware function to process the tracks.
   * @param middleware The middleware function to set, which can be a TracksMiddleware function or null to remove the middleware.
   */
  setTracksMiddleware: (middleware: TracksMiddleware | null) => Promise<void>;
};

export type CustomSourceManager = {
  setStream: (sourceId: string, stream: MediaStream | null) => Promise<void>;
  getSource: (sourceId: string) => CustomSourceState | undefined;
};
