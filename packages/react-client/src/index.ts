export { FishjamProvider, type FishjamProviderProps } from "./FishjamProvider";
export { useCamera, type UseCameraResult } from "./hooks/devices/useCamera";
export {
  useInitializeDevices,
  type UseInitializeDevicesParams,
  type UseInitializeDevicesResult,
} from "./hooks/devices/useInitializeDevices";
export { useMicrophone, type UseMicrophoneResult } from "./hooks/devices/useMicrophone";
export { type JoinRoomConfig, useConnection, type UseConnectionResult } from "./hooks/useConnection";
export { type PeerWithTracks, usePeers, type UsePeersResult } from "./hooks/usePeers";
export { useScreenShare, type UseScreenshareResult } from "./hooks/useScreenShare";
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
