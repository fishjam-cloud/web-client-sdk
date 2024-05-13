export type { Peer, Component, ConnectConfig, CreateConfig, MessageEvents, SignalingUrl } from "./JellyfishClient";

export type { ReconnectConfig } from "./reconnection";

export type { AuthErrorReason } from "./auth.js";

export { isAuthError, AUTH_ERROR_REASONS } from "./auth.js";

export { JellyfishClient } from "./JellyfishClient";

export type {
  TrackBandwidthLimit,
  SimulcastBandwidthLimit,
  BandwidthLimit,
  WebRTCEndpointEvents,
  TrackContextEvents,
  Endpoint,
  SimulcastConfig,
  TrackContext,
  TrackEncoding,
  VadStatus,
  EncodingReason,
  MetadataParser,
} from "./webrtc";

export * from "./webrtc";
