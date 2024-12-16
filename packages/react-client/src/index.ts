export { FishjamProvider } from "./FishjamProvider";
export { useCamera } from "./hooks/devices/useCamera";
export { useInitializeDevices } from "./hooks/devices/useInitializeDevices";
export { useMicrophone } from "./hooks/devices/useMicrophone";
export type { JoinRoomConfig } from "./hooks/useConnection";
export { useConnection } from "./hooks/useConnection";
export type { PeerWithTracks } from "./hooks/usePeers";
export { usePeers } from "./hooks/usePeers";
export { useScreenShare } from "./hooks/useScreenShare";
export { useUpdatePeerMetadata } from "./hooks/useUpdatePeerMetadata";
export { useVAD } from "./hooks/useVAD";
export type {
  Device,
  DeviceItem,
  DeviceType,
  PeerStatus,
  PersistLastDeviceHandlers,
  ScreenshareApi,
  StartStreamingProps,
  Track,
  TrackMiddleware,
  TracksMiddleware,
} from "./types/public";
export type {
  AuthErrorReason,
  BandwidthLimit,
  CreateConfig,
  EncodingReason,
  MessageEvents,
  Peer,
  ReconnectionStatus,
  SimulcastBandwidthLimit,
  SimulcastConfig,
  TrackBandwidthLimit,
  TrackContext,
  TrackContextEvents,
  VadStatus,
} from "@fishjam-cloud/ts-client";
export { Variant } from "@fishjam-cloud/ts-client";
