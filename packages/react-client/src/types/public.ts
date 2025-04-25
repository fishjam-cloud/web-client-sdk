import type { SimulcastConfig, TrackMetadata, Variant } from "@fishjam-cloud/ts-client";

export type InitializeDevicesStatus = "initialized" | "failed" | "initialized_with_errors" | "already_initialized";

export type InitializeDevicesResult = {
  status: InitializeDevicesStatus;
  stream: MediaStream | null;
  errors: { audio: DeviceError | null; video: DeviceError | null } | null;
};

export type TrackId = Brand<string, "TrackId">;
export type PeerId = Brand<string, "PeerId">;

export type Track = {
  stream: MediaStream | null;
  encoding: Variant | null;
  trackId: TrackId;
  metadata?: TrackMetadata;
  simulcastConfig: SimulcastConfig | null;
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
 * - `idle` - Peer is not connected, either never connected or successfully disconnected.
 * - `connecting` - Peer is in the process of connecting.
 * - `connected` - Peer has successfully connected.
 * - `error` - There was an error in the connection process.
 */
export type PeerStatus = "connecting" | "connected" | "error" | "idle";

export type DeviceItem = { deviceId: string; label: string };

export type PersistLastDeviceHandlers = {
  getLastDevice: (deviceType: "audio" | "video") => MediaDeviceInfo | null;
  saveLastDevice: (info: MediaDeviceInfo, deviceType: "audio" | "video") => void;
};

export type SimulcastBandwidthLimits = {
  [Variant.VARIANT_LOW]: number;
  [Variant.VARIANT_MEDIUM]: number;
  [Variant.VARIANT_HIGH]: number;
};

export type StreamConfig = { simulcast?: Variant[] | false };

export type BandwidthLimits = { singleStream: number; simulcast: SimulcastBandwidthLimits };

export type DeviceType = "audio" | "video";

export type DeviceError =
  | { name: "OverconstrainedError" }
  | { name: "NotAllowedError" }
  | { name: "NotFoundError" }
  | { name: "UNHANDLED_ERROR" };

declare const brand: unique symbol;
export type Brand<T, TBrand extends string> = T & { [brand]: TBrand };

export type CustomSource<T extends string> = {
  id: T;
  trackIds?: { videoId?: string; audioId?: string };
  stream?: MediaStream;
};
