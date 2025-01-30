export { AUTH_ERROR_REASONS, type AuthErrorReason, isAuthError } from './auth.js';
export { FishjamClient } from './FishjamClient';
export { isJoinError, JOIN_ERRORS, type JoinErrorReason } from './guards';
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
