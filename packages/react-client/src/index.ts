export type { JoinRoomConfig } from "./hooks/useConnection";
export type { PeerWithTracks } from "./hooks/usePeers";

export { useConnection } from "./hooks/useConnection";
export { usePeers } from "./hooks/usePeers";
export { useCamera } from "./hooks/devices/useCamera";
export { useMicrophone } from "./hooks/devices/useMicrophone";
export { useInitializeDevices } from "./hooks/devices/useInitializeDevices";
export { useScreenShare } from "./hooks/useScreenShare";
export { useUpdatePeerMetadata } from "./hooks/useUpdatePeerMetadata";
export { useVAD } from "./hooks/useVAD";

export { FishjamProvider } from "./fishjamProvider";

export type {
  Track,
  TrackMiddleware,
  TracksMiddleware,
  PeerStatus,
  Device,
  PersistLastDeviceHandlers,
  ScreenshareApi,
  StartStreamingProps,
  DeviceType,
} from "./types/public";

export type {
  Peer,
  MessageEvents,
  CreateConfig,
  TrackBandwidthLimit,
  SimulcastBandwidthLimit,
  BandwidthLimit,
  TrackContextEvents,
  SimulcastConfig,
  TrackContext,
  VadStatus,
  EncodingReason,
  AuthErrorReason,
  Variant,
} from "@fishjam-cloud/ts-client";
