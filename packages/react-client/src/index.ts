export { FishjamProvider, type FishjamProviderProps } from "./FishjamProvider";
export { useCamera } from "./hooks/devices/useCamera";
export { useInitializeDevices, UseInitializeDevicesParams } from "./hooks/devices/useInitializeDevices";
export { useMicrophone } from "./hooks/devices/useMicrophone";
export { InitializeDevicesSettings } from "./hooks/internal/devices/useMediaDevices";
export { type JoinRoomConfig, useConnection } from "./hooks/useConnection";
export { useCustomSource } from "./hooks/useCustomSource";
export {
  type ConnectStreamerConfig,
  type StreamerInputs,
  useLivestreamStreamer,
  type UseLivestreamStreamerResult,
} from "./hooks/useLivestreamStreamer";
export {
  type ConnectViewerConfig,
  useLivestreamViewer,
  type UseLivestreamViewerResult,
} from "./hooks/useLivestreamViewer";
export { type PeerWithTracks, usePeers } from "./hooks/usePeers";
export { type RoomType, useSandbox, type UseSandboxProps } from "./hooks/useSandbox";
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
  MiddlewareResult,
  PeerId,
  PeerStatus,
  PersistLastDeviceHandlers,
  SimulcastBandwidthLimits,
  StreamConfig,
  Track,
  TrackId,
  TrackMiddleware,
  TracksMiddleware,
  TracksMiddlewareResult,
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
