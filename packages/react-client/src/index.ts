export { FishjamProvider, type FishjamProviderProps } from "./FishjamProvider";
export { useCamera } from "./hooks/devices/useCamera";
export { useInitializeDevices, UseInitializeDevicesParams } from "./hooks/devices/useInitializeDevices";
export { useMicrophone } from "./hooks/devices/useMicrophone";
export { InitializeDevicesSettings } from "./hooks/internal/devices/useMediaDevices";
export { type JoinRoomConfig, useConnection } from "./hooks/useConnection";
export { useCustomSource } from "./hooks/useCustomSource";
export { useLivestream, type UseLivestreamResult } from "./hooks/useLivestream";
export { type PeerWithTracks, usePeers } from "./hooks/usePeers";
export { useScreenShare } from "./hooks/useScreenShare";
export { useUpdatePeerMetadata } from "./hooks/useUpdatePeerMetadata";
export { useVAD } from "./hooks/useVAD";
export type {
  BandwidthLimits,
  Brand,
  CustomSource,
  DeviceError,
  DeviceItem,
  InitializeDevicesResult,
  InitializeDevicesStatus,
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
  JoinErrorReason,
  Metadata,
  ReconnectConfig,
  ReconnectionStatus,
  SimulcastBandwidthLimit,
  SimulcastConfig,
  TrackBandwidthLimit,
} from "@fishjam-cloud/ts-client";
export { Variant } from "@fishjam-cloud/ts-client";
