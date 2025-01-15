export { FishjamProvider, type FishjamProviderProps } from "./FishjamProvider";
export { useCamera } from "./hooks/devices/useCamera";
export { useInitializeDevices } from "./hooks/devices/useInitializeDevices";
export { useMicrophone } from "./hooks/devices/useMicrophone";
export { type JoinRoomConfig, useConnection } from "./hooks/useConnection";
export { type PeerWithTracks, usePeers } from "./hooks/usePeers";
export { useScreenShare } from "./hooks/useScreenShare";
export { useUpdatePeerMetadata } from "./hooks/useUpdatePeerMetadata";
export { useVAD } from "./hooks/useVAD";
export type {
  DeviceItem,
  PeerStatus,
  PersistLastDeviceHandlers,
  StreamConfig,
  Track,
  TrackMiddleware,
  TracksMiddleware,
} from "./types/public";
export type {
  AuthErrorReason,
  Metadata,
  ReconnectConfig,
  ReconnectionStatus,
  SimulcastBandwidthLimit,
  SimulcastConfig,
  TrackBandwidthLimit,
} from "@fishjam-cloud/ts-client";
export { Variant } from "@fishjam-cloud/ts-client";
