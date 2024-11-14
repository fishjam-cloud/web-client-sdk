export type {
  Peer,
  Component,
  ConnectConfig,
  CreateConfig,
  MessageEvents,
  FishjamTrackContext,
  TrackMetadata,
  Metadata,
  MetadataDefault,
} from './types';

export { FishjamClient } from './FishjamClient';

export type { ReconnectConfig, ReconnectionStatus } from './reconnection';

export type { AuthErrorReason } from './auth.js';

export { isAuthError, AUTH_ERROR_REASONS } from './auth.js';

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
} from '@fishjam-cloud/webrtc-client';

export * from '@fishjam-cloud/webrtc-client';
