export {
  useConnection,
  useCamera,
  useMicrophone,
  useInitializeDevices,
  usePeers,
  useScreenShare,
  useUpdatePeerMetadata,
  useVAD,
} from "./hooks/public";
export { FishjamProvider } from "./fishjamProvider";

export {
  Track,
  TrackMiddleware,
  TracksMiddleware,
  PeerStatus,
  Device,
  PeerWithTracks,
  ConnectConfig,
  PersistLastDeviceHandlers,
  ScreenshareApi,
  StartStreamingProps,
} from "./types/public";

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
  AuthErrorReason,
  Encoding,
} from "@fishjam-cloud/ts-client";
