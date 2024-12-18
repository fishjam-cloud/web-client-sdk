export { FishjamProvider, type FishjamProviderProps } from "./FishjamProvider";
export { useCamera, type UseCameraResult } from "./hooks/devices/useCamera";
export { useInitializeDevices, type UseInitializeDevicesResult } from "./hooks/devices/useInitializeDevices";
export { useMicrophone, type UseMicrophoneResult } from "./hooks/devices/useMicrophone";
export { type JoinRoomConfig, useConnection, type UseConnectionResult } from "./hooks/useConnection";
export { type PeerWithTracks, usePeers, type UsePeersResult } from "./hooks/usePeers";
export { useScreenShare, type UseScreenshareResult } from "./hooks/useScreenShare";
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
