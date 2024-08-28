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
  Participiants,
  StorageConfig,
  Devices,
  UserMediaAPI,
  UseSetupMediaResult,
  UseSetupMediaConfig,
  CreateFishjamClient,
  ScreenshareApi,
  UseConnect,
  ConnectConfig,
  TrackManager,
  TrackMiddleware,
  TrackMetadata, // only for compatibility reasons, will be removed in: FCE-415
  PeerMetadata, // only for compatibility reasons, will be removed in: FCE-415
} from "./types";

export { AUDIO_TRACK_CONSTRAINTS, VIDEO_TRACK_CONSTRAINTS, SCREEN_SHARING_MEDIA_CONSTRAINTS } from "./constraints";

export type {
  Peer,
  MessageEvents,
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
  AuthErrorReason,
  Encoding,
} from "@fishjam-cloud/ts-client";

export { FishjamClient } from "@fishjam-cloud/ts-client";
