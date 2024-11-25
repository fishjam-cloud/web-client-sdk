import type {
  Variant,
  SimulcastConfig,
  TrackMetadata,
  ConnectConfig as TSClientConnectConfig,
  VadStatus,
} from "@fishjam-cloud/ts-client";

import type {
  DeviceError,
  DeviceManagerStatus,
  DistinguishedTracks,
  PeerState,
  TrackId,
  TrackManager,
} from "./internal";

export type Track = {
  stream: MediaStream | null;
  encoding: Variant | null;
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

export type PeerWithTracks<P, S> = PeerState<P, S> & DistinguishedTracks;

export type ConnectConfig<P> = Omit<TSClientConnectConfig<P>, "peerMetadata"> & { peerMetadata?: P };

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

export type SimulcastBandwidthLimits = {
  [Variant.VARIANT_LOW]: number;
  [Variant.VARIANT_MEDIUM]: number;
  [Variant.VARIANT_HIGH]: number;
};

export type StartStreamingProps = { simulcast?: Variant[] | false };

export type BandwidthLimits = { singleStream: number; simulcast: SimulcastBandwidthLimits };
