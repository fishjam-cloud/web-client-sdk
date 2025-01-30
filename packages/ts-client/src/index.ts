export { type AuthErrorReason, AUTH_ERROR_REASONS, isAuthError } from './auth.js';
export { FishjamClient } from './FishjamClient';
export { type JoinErrorReason, JOIN_ERRORS, isJoinError } from './guards';
export type { ReconnectConfig, ReconnectionStatus } from './reconnection';
export type {
  Component,
  ConnectConfig,
  CreateConfig,
  FishjamTrackContext,
  GenericMetadata,
  MessageEvents,
  Metadata,
  Peer,
  TrackContextEvents,
  TrackMetadata,
} from './types';
export type {
  BandwidthLimit,
  EncodingReason,
  Endpoint,
  SimulcastBandwidthLimit,
  SimulcastConfig,
  TrackBandwidthLimit,
  TrackContext,
  VadStatus,
  WebRTCEndpointEvents,
} from '@fishjam-cloud/webrtc-client';
export * from '@fishjam-cloud/webrtc-client';
