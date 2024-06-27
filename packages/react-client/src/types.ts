import type { ConnectConfig, SimulcastConfig, TrackBandwidthLimit } from "@fishjam-dev/ts-client";
import type { ScreenShareManagerConfig } from "./ScreenShareManager";
import type { PeerStatus, Selector, State, Track, TrackId, TrackWithOrigin, UseReconnection } from "./state.types";
import type { JSX, ReactNode } from "react";
import type { Client } from "./Client";

export type AudioOrVideoType = "audio" | "video";

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
  videoTrackConstraints?: boolean | MediaTrackConstraints;
  audioTrackConstraints?: boolean | MediaTrackConstraints;
  startOnMount?: boolean;
  storage?: boolean | StorageConfig;
};

export type StorageConfig = {
  getLastAudioDevice: (() => MediaDeviceInfo | null) | null;
  saveLastAudioDevice: (info: MediaDeviceInfo) => void;
  getLastVideoDevice: (() => MediaDeviceInfo | null) | null;
  saveLastVideoDevice: (info: MediaDeviceInfo) => void;
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

export type GetMedia =
  | { stream: MediaStream; type: "OK"; constraints: MediaStreamConstraints; previousErrors: Errors }
  | { error: DeviceError | null; type: "Error"; constraints: MediaStreamConstraints };

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

export type CameraAPI<TrackMetadata> = {
  stop: () => void;
  setEnable: (value: boolean) => void;
  start: (deviceId?: string) => void;
  addTrack: (
    trackMetadata?: TrackMetadata,
    simulcastConfig?: SimulcastConfig,
    maxBandwidth?: TrackBandwidthLimit,
  ) => Promise<string>;
  removeTrack: () => Promise<void>;
  replaceTrack: (newTrackMetadata?: TrackMetadata) => Promise<void>;
  muteTrack: (newTrackMetadata?: TrackMetadata) => Promise<void>;
  unmuteTrack: (newTrackMetadata?: TrackMetadata) => Promise<void>;
  updateTrackMetadata: (newTrackMetadata: TrackMetadata) => void;
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

export type MicrophoneAPI<TrackMetadata> = {
  stop: () => void;
  setEnable: (value: boolean) => void;
  start: (deviceId?: string) => void;
  addTrack: (trackMetadata?: TrackMetadata, maxBandwidth?: TrackBandwidthLimit) => Promise<string>;
  removeTrack: () => Promise<void>;
  replaceTrack: (newTrackMetadata?: TrackMetadata) => Promise<void>;
  muteTrack: (newTrackMetadata?: TrackMetadata) => Promise<void>;
  unmuteTrack: (newTrackMetadata?: TrackMetadata) => Promise<void>;
  updateTrackMetadata: (newTrackMetadata: TrackMetadata) => void;
  broadcast: Track<TrackMetadata> | null;
  status: DevicesStatus | null;
  stream: MediaStream | null;
  track: MediaStreamTrack | null;
  enabled: boolean;
  mediaStatus: MediaStatus | null;
  deviceInfo: MediaDeviceInfo | null;
  error: DeviceError | null;
  devices: MediaDeviceInfo[] | null;
};

export type ScreenShareAPI<TrackMetadata> = {
  stop: () => void;
  setEnable: (value: boolean) => void;
  start: (config?: ScreenShareManagerConfig) => void;
  addTrack: (trackMetadata?: TrackMetadata, maxBandwidth?: TrackBandwidthLimit) => Promise<string>;
  removeTrack: () => Promise<void>;
  broadcast: Track<TrackMetadata> | null;
  status: DevicesStatus | null;
  stream: MediaStream | null;
  // todo is mediaStatus necessary?,
  mediaStatus: MediaStatus | null;
  track: MediaStreamTrack | null;
  enabled: boolean;
  error: DeviceError | null;
};

export type Devices<TrackMetadata> = {
  camera: CameraAPI<TrackMetadata>;
  microphone: MicrophoneAPI<TrackMetadata>;
  screenShare: ScreenShareAPI<TrackMetadata>;
  init: (config?: DeviceManagerConfig) => void;
  start: (config: DeviceManagerStartConfig) => void;
};

export const PERMISSION_DENIED: DeviceError = { name: "NotAllowedError" };
export const OVERCONSTRAINED_ERROR: DeviceError = { name: "OverconstrainedError" };
export const NOT_FOUND_ERROR: DeviceError = { name: "NotFoundError" };
export const UNHANDLED_ERROR: DeviceError = { name: "UNHANDLED_ERROR" };

// https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#exceptions
// OverconstrainedError has higher priority than NotAllowedError
export const parseError = (error: unknown): DeviceError | null => {
  if (error && typeof error === "object" && "name" in error) {
    if (error.name === "NotAllowedError") {
      return PERMISSION_DENIED;
    } else if (error.name === "OverconstrainedError") {
      return OVERCONSTRAINED_ERROR;
    } else if (error.name === "NotFoundError") {
      return NOT_FOUND_ERROR;
    }
  }

  console.warn({ name: "Unhandled getUserMedia error", error });
  return null;
};

export type FishjamContextProviderProps = {
  children: ReactNode;
};

export type FishjamContextType<PeerMetadata, TrackMetadata> = {
  state: State<PeerMetadata, TrackMetadata>;
};

export type UseConnect<PeerMetadata> = (config: ConnectConfig<PeerMetadata>) => () => void;

export type CreateFishjamClient<PeerMetadata, TrackMetadata> = {
  FishjamContextProvider: ({ children }: FishjamContextProviderProps) => JSX.Element;
  useConnect: () => (config: ConnectConfig<PeerMetadata>) => () => void;
  useDisconnect: () => () => void;
  useStatus: () => PeerStatus;
  useSelector: <Result>(selector: Selector<PeerMetadata, TrackMetadata, Result>) => Result;
  useTracks: () => Record<TrackId, TrackWithOrigin<PeerMetadata, TrackMetadata>>;
  useSetupMedia: (config: UseSetupMediaConfig<TrackMetadata>) => UseSetupMediaResult;
  useCamera: () => Devices<TrackMetadata>["camera"];
  useMicrophone: () => Devices<TrackMetadata>["microphone"];
  useScreenShare: () => ScreenShareAPI<TrackMetadata>;
  useClient: () => Client<PeerMetadata, TrackMetadata>;
  useReconnection: () => UseReconnection;
};
