import type {
  Encoding,
  SimulcastConfig,
  TrackMetadata,
  VadStatus,
  Peer as LegacyPeer,
  GenericMetadata,
} from "@fishjam-cloud/ts-client";

import type { DeviceError, DeviceManagerStatus, TrackManager } from "./internal";

export type PeerId = Brand<string, "PeerId">;
export type TrackId = string; //Brand<string, "TrackId">;

export type Peer<PeerMetadata = GenericMetadata, ServerMetadata = GenericMetadata> = Omit<
  LegacyPeer<PeerMetadata, ServerMetadata>,
  "id"
> & {
  id: PeerId;
};

export type Track = {
  stream: MediaStream | null;
  encoding: Encoding | null;
  trackId: TrackId;
  metadata?: TrackMetadata;
  simulcastConfig: SimulcastConfig | null;
  vadStatus: VadStatus;
  track: MediaStreamTrack | null;
};

export type TrackMiddleware = ((track: MediaStreamTrack) => { track: MediaStreamTrack; onClear?: () => void }) | null;

export type TracksMiddleware = (
  videoTrack: MediaStreamTrack,
  audioTrack: MediaStreamTrack | null,
) => { videoTrack: MediaStreamTrack; audioTrack: MediaStreamTrack | null; onClear: () => void };

/**
 * Represents the possible statuses of a peer connection.
 *
 * idle - Peer is not connected, either never connected or successfully disconnected.
 * connecting - Peer is in the process of connecting.
 * connected - Peer has successfully connected.
 * error - There was an error in the connection process.
 */
export type PeerStatus = "connecting" | "connected" | "error" | "idle";

export type Device = {
  isStreaming: boolean;
  status: DeviceManagerStatus;
  trackId: TrackId | null;
  track: MediaStreamTrack | null;
  stream: MediaStream | null;
  devices: MediaDeviceInfo[];
  activeDevice: MediaDeviceInfo | null;
  currentMiddleware: TrackMiddleware;
  deviceError: DeviceError | null;
  isMuted: boolean;
  isDeviceEnabled: boolean;
} & Omit<TrackManager, "currentTrack">;

export type PersistLastDeviceHandlers = {
  getLastDevice: () => MediaDeviceInfo | null;
  saveLastDevice: (info: MediaDeviceInfo) => void;
};

export type ScreenshareApi = {
  startStreaming: (props?: {
    audioConstraints?: boolean | MediaTrackConstraints;
    videoConstraints?: boolean | MediaTrackConstraints;
  }) => Promise<void>;
  stopStreaming: () => Promise<void>;
  stream: MediaStream | null;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  videoBroadcast: Track | null;
  audioBroadcast: Track | null;
  setTracksMiddleware: (middleware: TracksMiddleware | null) => Promise<void>;
  currentTracksMiddleware: TracksMiddleware | null;
};

export type SimulcastBandwidthLimits = Record<Encoding, number>;

export type StartStreamingProps = { simulcast?: Encoding[] | false };

export type BandwidthLimits = { singleStream: number; simulcast: SimulcastBandwidthLimits };

export type DeviceType = "audio" | "video";

declare const brand: unique symbol;
type Brand<T, TBrand extends string> = T & { [brand]: TBrand };
