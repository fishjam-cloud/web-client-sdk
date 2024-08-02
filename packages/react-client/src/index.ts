export { create } from "./create";

export { Client } from "./Client";
export type { ClientEvents } from "./Client";

export type {
  PeerState,
  Track,
  PeerId,
  TrackId,
  TrackWithOrigin,
  Origin,
  PeerStatus,
  Selector,
  State,
  SetStore,
} from "./state.types";

export type {
  DeviceManagerConfig,
  StorageConfig,
  Devices,
  UserMediaAPI,
  ScreenShareAPI,
  UseSetupMediaResult,
  UseSetupMediaConfig,
  CreateFishjamClient,
  UseConnect,
  GenericTrackManager,
} from "./types";

export type { ScreenShareManagerConfig } from "./ScreenShareManager";

export { AUDIO_TRACK_CONSTRAINTS, VIDEO_TRACK_CONSTRAINTS, SCREEN_SHARING_MEDIA_CONSTRAINTS } from "./constraints";

export type {
  Peer,
  MessageEvents,
  SignalingUrl,
  CreateConfig,
  TrackBandwidthLimit,
  SimulcastBandwidthLimit,
  BandwidthLimit,
  WebRTCEndpointEvents,
  TrackContextEvents,
  Endpoint,
  SimulcastConfig,
  TrackContext,
  VadStatus,
  EncodingReason,
  MetadataParser,
  ConnectConfig,
  AuthErrorReason,
  Encoding,
} from "@fishjam-cloud/ts-client";

export { FishjamClient } from "@fishjam-cloud/ts-client";
