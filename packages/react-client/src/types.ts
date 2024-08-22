import type {
  ConnectConfig as TSClientConnectConfig,
  SimulcastConfig,
  TrackBandwidthLimit,
  TrackKind,
} from "@fishjam-cloud/ts-client";
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

// todo change to Inner / Hidden metadata
export type PeerMetadata = {
  displayName?: string;
};

export type TrackMetadata = {
  type: "camera" | "microphone" | "screenShareVideo" | "screenShareAudio";
  paused: boolean;
  // track label used in recordings
  displayName?: string;
};

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

export type CurrentDevices = { videoinput: MediaDeviceInfo | null; audioinput: MediaDeviceInfo | null };

export type UseSetupMediaConfig = {
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

export interface GenericTrackManager {
  initialize: (deviceId?: string) => Promise<void>;
  stop: () => Promise<void>;
  startStreaming: (simulcastConfig?: SimulcastConfig, maxBandwidth?: TrackBandwidthLimit) => Promise<string>;
  stopStreaming: () => Promise<void>;
  pauseStreaming: () => Promise<void>;
  resumeStreaming: () => Promise<void>;
  isPaused: () => boolean;
  disableTrack: () => void;
  enableTrack: () => void;
}

export type UserMediaAPI = {
  broadcast: Track | null;
  status: DevicesStatus | null; // todo how to remove null
  stream: MediaStream | null;
  track: MediaStreamTrack | null;
  enabled: boolean;
  mediaStatus: MediaStatus | null;
  deviceInfo: MediaDeviceInfo | null;
  error: DeviceError | null;
  devices: MediaDeviceInfo[] | null;
};

export type ScreenshareApi = {
  startStreaming: (props?: {
    audioConstraints?: boolean | MediaTrackConstraints;
    videoConstraints?: boolean | MediaTrackConstraints;
  }) => Promise<void>;
  stopStreaming: () => Promise<void>;
  stream: MediaStream | null;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  videoBroadcast: Track | null;
  audioBroadcast: Track | null;
};

export type Devices = {
  camera: UserMediaAPI;
  microphone: UserMediaAPI;
};

export type FishjamContextProviderProps = {
  children: ReactNode;
};

export type ScreenshareState = {
  stream: MediaStream;
  trackIds: { videoId: string; audioId?: string };
} | null;

export type FishjamContextType = {
  state: State;
  screenshareState: [ScreenshareState, React.Dispatch<React.SetStateAction<ScreenshareState>>];
};

export type ConnectConfig = Omit<TSClientConnectConfig<PeerMetadata>, "peerMetadata"> & { peerMetadata?: PeerMetadata };
export type UseConnect = (config: ConnectConfig) => () => void;

type DistinguishedTracks = {
  videoTrack?: Track;
  audioTrack?: Track;
};

export type PeerStateWithTracks = PeerState & DistinguishedTracks;

export type CreateFishjamClient = {
  FishjamContextProvider: ({ children }: FishjamContextProviderProps) => JSX.Element;
  useConnect: () => (config: ConnectConfig) => () => void;
  useDisconnect: () => () => void;
  useStatus: () => PeerStatus;
  useSelector: <Result>(selector: Selector<Result>) => Result;
  useTracks: () => Record<TrackId, TrackWithOrigin>;
  useSetupMedia: (config: UseSetupMediaConfig) => UseSetupMediaResult;
  useCamera: () => Devices["camera"] & GenericTrackManager;
  useMicrophone: () => Devices["microphone"] & GenericTrackManager;
  useClient: () => Client;
  useReconnection: () => UseReconnection;
  useParticipants: () => {
    localParticipant: PeerStateWithTracks | null;
    participants: PeerStateWithTracks[];
  };
  useScreenShare: () => ScreenshareApi;
};

export type TrackType = TrackKind | "audiovideo";
export type MediaDeviceType = "displayMedia" | "userMedia";
