export { FishjamProvider, type FishjamProviderProps } from "./FishjamProvider";
export { useCamera } from "./hooks/devices/useCamera";
export { useInitializeDevices, UseInitializeDevicesParams } from "./hooks/devices/useInitializeDevices";
export { useMicrophone } from "./hooks/devices/useMicrophone";
export { type JoinRoomConfig, useConnection } from "./hooks/useConnection";
export { type PeerWithTracks, usePeers } from "./hooks/usePeers";
export { useScreenShare } from "./hooks/useScreenShare";
export { useUpdatePeerMetadata } from "./hooks/useUpdatePeerMetadata";
export { useVAD } from "./hooks/useVAD";
export type {
  BandwidthLimits,
  Brand,
  DeviceError,
  DeviceItem,
  PeerId,
  PeerStatus,
  PersistLastDeviceHandlers,
  SimulcastBandwidthLimits,
  StreamConfig,
  Track,
  TrackId,
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
