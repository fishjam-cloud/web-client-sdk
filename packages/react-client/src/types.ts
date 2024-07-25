import type { ConnectConfig, SimulcastConfig, TrackBandwidthLimit } from "@fishjam-dev/ts-client";
import type { ScreenShareManagerConfig } from "./ScreenShareManager";
import type {
  PeerState,
  PeerStatus,
  Selector,
  State,
  Track,
  TrackId,
  TrackWithOrigin,
  UseReconnection,
} from "./state.types";
import type { JSX, ReactNode } from "react";
import type { Client } from "./Client";

export type DevicesStatus = "OK" | "Error" | "Not requested" | "Requesting";
export type MediaStatus = "OK" | "Error" | "Not requested" | "Requesting";

export type Media = {
  stream: MediaStream | null;
  track: MediaStreamTrack | null;
  enabled: boolean;
  deviceInfo: MediaDeviceInfo | null;
};

export type DeviceState = {
  media: Media | null;
  mediaStatus: MediaStatus;
  devices: MediaDeviceInfo[] | null;
  devicesStatus: DevicesStatus;
  error: DeviceError | null;
};

export type MediaState = {
  video: DeviceState;
  audio: DeviceState;
};

export type DeviceManagerInitConfig = {
  videoTrackConstraints?: boolean | MediaTrackConstraints;
  audioTrackConstraints?: boolean | MediaTrackConstraints;
};

export type DeviceManagerConfig = {
  trackConstraints?: boolean | MediaTrackConstraints;
  startOnMount?: boolean;
  storage?: boolean | StorageConfig;
};

export type StorageConfig = {
  getLastDevice: (() => MediaDeviceInfo | null) | null;
  saveLastDevice: (info: MediaDeviceInfo) => void;
};

export type DeviceManagerStartConfig = {
  audioDeviceId?: string | boolean;
  videoDeviceId?: string | boolean;
};

export type DeviceError =
  | { name: "OverconstrainedError" }
  | { name: "NotAllowedError" }
  | { name: "NotFoundError" }
  | { name: "UNHANDLED_ERROR" };

export type Errors = {
  audio?: DeviceError | null;
  video?: DeviceError | null;
};

export type CurrentDevices = { videoinput: MediaDeviceInfo | null; audioinput: MediaDeviceInfo | null };

export type UseSetupMediaConfig<TrackMetadata> = {
  camera: {
    /**
     * Determines whether broadcasting should start when the user connects to the server with an active camera stream.
     */
    broadcastOnConnect?: boolean;
    /**
     * Determines whether broadcasting should start when the user initiates the camera and is connected to the server.
     */
    broadcastOnDeviceStart?: boolean;
    /**
     * Determines whether track should be replaced when the user requests a device.
     * default: replace
     */
    onDeviceChange?: "replace" | "remove";
    /**
     * Determines whether currently broadcasted track should be removed or muted
     * when the user stopped a device.
     * default: replace
     */
    onDeviceStop?: "remove" | "mute";

    trackConstraints: boolean | MediaTrackConstraints;
    defaultTrackMetadata?: TrackMetadata;
    defaultSimulcastConfig?: SimulcastConfig;
    defaultMaxBandwidth?: TrackBandwidthLimit;
  };
  microphone: {
    /**
     * Determines whether broadcasting should start when the user connects to the server with an active camera stream.
     */
    broadcastOnConnect?: boolean;
    /**
     * Determines whether broadcasting should start when the user initiates the camera and is connected to the server.
     */
    broadcastOnDeviceStart?: boolean;
    /**
     * Determines whether currently broadcasted track should be replaced or stopped
     * when the user changed a device.
     * default: replace
     */
    onDeviceChange?: "replace" | "remove";

    /**
     * Determines whether currently broadcasted track should be removed or muted
     * when the user stopped a device.
     * default: replace
     */
    onDeviceStop?: "remove" | "mute";

    trackConstraints: boolean | MediaTrackConstraints;
    defaultTrackMetadata?: TrackMetadata;
    defaultMaxBandwidth?: TrackBandwidthLimit;
  };
  screenShare: {
    /**
     * Determines whether broadcasting should start when the user connects to the server with an active camera stream.
     */
    broadcastOnConnect?: boolean;
    /**
     * Determines whether broadcasting should start when the user initiates the camera and is connected to the server.
     */
    broadcastOnDeviceStart?: boolean;

    streamConfig?: ScreenShareManagerConfig;

    defaultTrackMetadata?: TrackMetadata;
    defaultMaxBandwidth?: TrackBandwidthLimit;
  };
  startOnMount?: boolean;
  storage?: boolean | StorageConfig;
};

export type UseSetupMediaResult = {
  init: () => void;
};

export interface GenericMediaManager {
  start: (deviceId?: string | boolean) => Promise<void>;
  stop: () => Promise<void>;
  disable: () => void;
  enable: () => void;
  getTracks: () => MediaStreamTrack[];
  getMedia: () => { stream: MediaStream | null; track: MediaStreamTrack | null; enabled: boolean } | null;
}

export interface GenericTrackManager<TrackMetadata> {
  initialize: (deviceId?: string) => Promise<void>;
  cleanup: () => Promise<void>;
  startStreaming: (
    trackMetadata?: TrackMetadata,
    simulcastConfig?: SimulcastConfig,
    maxBandwidth?: TrackBandwidthLimit,
  ) => Promise<string>;
  stopStreaming: () => Promise<void>;
  pauseStreaming: () => Promise<void>;
  resumeStreaming: () => Promise<void>;
  disableTrack: () => void;
  enableTrack: () => void;
}

export type UserMediaAPI<TrackMetadata> = {
  broadcast: Track<TrackMetadata> | null;
  status: DevicesStatus | null; // todo how to remove null
  stream: MediaStream | null;
  track: MediaStreamTrack | null;
  enabled: boolean;
  mediaStatus: MediaStatus | null;
  deviceInfo: MediaDeviceInfo | null;
  error: DeviceError | null;
  devices: MediaDeviceInfo[] | null;
};

export type ScreenShareAPI<TrackMetadata> = {
  initialize: (config?: ScreenShareManagerConfig) => Promise<void>;
  cleanup: () => Promise<void>;
  startStreaming: (trackMetadata?: TrackMetadata, maxBandwidth?: TrackBandwidthLimit) => Promise<string>;
  stopStreaming: () => Promise<void>;
  disableTrack: () => void;
  enableTrack: () => void;
  broadcast: Track<TrackMetadata> | null;
  status: DevicesStatus | null;
  stream: MediaStream | null;
  track: MediaStreamTrack | null;
  enabled: boolean;
  // todo is mediaStatus necessary?,
  mediaStatus: MediaStatus | null;
  error: DeviceError | null;
};

export type Devices<TrackMetadata> = {
  camera: UserMediaAPI<TrackMetadata>;
  microphone: UserMediaAPI<TrackMetadata>;
  screenShare: ScreenShareAPI<TrackMetadata>;
};

export type FishjamContextProviderProps = {
  children: ReactNode;
};

export type FishjamContextType<PeerMetadata, TrackMetadata> = {
  state: State<PeerMetadata, TrackMetadata>;
};

export type UseConnect<PeerMetadata> = (config: ConnectConfig<PeerMetadata>) => () => void;

type DistinguishedTracks<TrackMetadata> = {
  videoTrack?: Track<TrackMetadata>;
  audioTrack?: Track<TrackMetadata>;
};

export type CreateFishjamClient<PeerMetadata, TrackMetadata> = {
  FishjamContextProvider: ({ children }: FishjamContextProviderProps) => JSX.Element;
  useConnect: () => (config: ConnectConfig<PeerMetadata>) => () => void;
  useDisconnect: () => () => void;
  useStatus: () => PeerStatus;
  useSelector: <Result>(selector: Selector<PeerMetadata, TrackMetadata, Result>) => Result;
  useTracks: () => Record<TrackId, TrackWithOrigin<PeerMetadata, TrackMetadata>>;
  useSetupMedia: (config: UseSetupMediaConfig<TrackMetadata>) => UseSetupMediaResult;
  useCamera: () => Devices<TrackMetadata>["camera"] & GenericTrackManager<TrackMetadata>;
  useMicrophone: () => Devices<TrackMetadata>["microphone"] & GenericTrackManager<TrackMetadata>;
  useScreenShare: () => ScreenShareAPI<TrackMetadata>;
  useClient: () => Client<PeerMetadata, TrackMetadata>;
  useReconnection: () => UseReconnection;
  useParticipants: () => {
    localParticipant: (PeerState<PeerMetadata, TrackMetadata> & DistinguishedTracks<TrackMetadata>) | null;
    participants: (PeerState<PeerMetadata, TrackMetadata> & DistinguishedTracks<TrackMetadata>)[];
  };
};
