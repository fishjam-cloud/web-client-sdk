import type {
  Encoding,
  SimulcastConfig,
  ConnectConfig as TSClientConnectConfig,
  VadStatus,
} from "@fishjam-cloud/ts-client";
import type { DistinguishedTracks, PeerMetadata, PeerState, TrackId, TrackManager, TrackMetadata } from "./internal";

export type Track = {
  stream: MediaStream | null;
  encoding: Encoding | null;
  trackId: TrackId;
  metadata?: TrackMetadata;
  simulcastConfig: SimulcastConfig | null;
  vadStatus: VadStatus;
  track: MediaStreamTrack | null;
};

export type TrackMiddleware =
  | ((track: MediaStreamTrack | null) => { track: MediaStreamTrack | null; onClear?: () => void })
  | null;

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

export type ToggleMode = "soft" | "hard";

export type Device = {
  isStreaming: boolean;
  trackId: TrackId | null;
  track: MediaStreamTrack | null;
  stream: MediaStream | null;
  devices: MediaDeviceInfo[];
  activeDevice: MediaDeviceInfo | null;
} & Omit<TrackManager, "currentTrack">;

export type AudioDevice = Device & { isAudioPlaying: boolean };

export type PeerWithTracks = PeerState & DistinguishedTracks;

export type ConnectConfig = Omit<TSClientConnectConfig<PeerMetadata>, "peerMetadata"> & { peerMetadata?: PeerMetadata };

export type DeviceManagerConfig = {
  trackConstraints?: boolean | MediaTrackConstraints;
  startOnMount?: boolean;
  storage?: boolean | StorageConfig;
};

export type StorageConfig = {
  getLastDevice: (() => MediaDeviceInfo | null) | null;
  saveLastDevice: (info: MediaDeviceInfo) => void;
};
