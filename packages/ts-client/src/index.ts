export type { Peer, Component, ConnectConfig, CreateConfig, MessageEvents, FishjamTrackContext } from './types';

export type { ReconnectConfig, ReconnectionStatus } from './reconnection';

export type { AuthErrorReason } from './auth.js';

export { isAuthError, AUTH_ERROR_REASONS } from './auth.js';

export { FishjamClient } from './FishjamClient';

export type {
  TrackBandwidthLimit,
  SimulcastBandwidthLimit,
  BandwidthLimit,
  WebRTCEndpointEvents,
  TrackContextEvents,
  Endpoint,
  SimulcastConfig,
  TrackContext,
  Encoding,
  VadStatus,
  EncodingReason,
} from './webrtc';

export * from './webrtc';
