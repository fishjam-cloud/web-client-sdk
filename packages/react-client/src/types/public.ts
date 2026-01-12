import type { DataCallback, DataChannelOptions, SimulcastConfig, TrackMetadata, Variant } from "@fishjam-cloud/ts-client";

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

export type MiddlewareResult = { track: MediaStreamTrack; onClear?: () => void };
export type TrackMiddleware = ((track: MediaStreamTrack) => MiddlewareResult | Promise<MiddlewareResult>) | null;

export type TracksMiddlewareResult = {
  videoTrack: MediaStreamTrack;
  audioTrack: MediaStreamTrack | null;
  onClear: () => void;
};
export type TracksMiddleware = (
  videoTrack: MediaStreamTrack,
  audioTrack: MediaStreamTrack | null,
) => TracksMiddlewareResult | Promise<TracksMiddlewareResult>;

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

export type UseDataPublisherResult = {
  /**
   * Sends data through a data publisher.
   * @param data - The data to send as Uint8Array
   * @param options - Specify { reliable: true } for guaranteed delivery or { reliable: false } for low latency
   */
  publishData: (data: Uint8Array, options: DataChannelOptions) => void;
  /**
   * Subscribe to incoming data on a data publisher.
   * Can be called before or after publisher creation.
   * @param callback - Function called when data is received
   * @param options - Specify { reliable: true } or { reliable: false } to choose publisher
   * @returns Unsubscribe function - call to cancel the subscription
   */
  subscribeData: (callback: DataCallback, options: DataChannelOptions) => () => void;
  /**
   * Whether data publishers are connected and ready to send data.
   * Resets to false on disconnect.
   */
  isConnected: boolean;
  /**
   * Error that occurred during data publisher operations, or null if no error.
   */
  error: Error | null;
};
