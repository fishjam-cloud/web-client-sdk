import type { SimulcastConfig, TrackBandwidthLimit } from "@fishjam-dev/ts-client";
import type { ScreenShareManagerConfig } from "./ScreenShareManager";
import type { Track } from "./state.types";

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

export type UseUserMediaState = {
  video: DeviceState;
  audio: DeviceState;
};

export type InitMediaConfig = {
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

export type UseUserMediaStartConfig = {
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
    broadcastOnDeviceChange?: "replace" | "stop";

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
     * Determines whether track should be replaced when the user requests a device.
     * default: replace
     */
    broadcastOnDeviceChange?: "replace" | "stop";

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

export type UseCameraResult<TrackMetadata> = {
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

export type UseMicrophoneResult<TrackMetadata> = {
  stop: () => void;
  setEnable: (value: boolean) => void;
  start: (deviceId?: string) => void;
  addTrack: (trackMetadata?: TrackMetadata, maxBandwidth?: TrackBandwidthLimit) => Promise<string>;
  removeTrack: () => Promise<void>;
  replaceTrack: (newTrackMetadata?: TrackMetadata) => Promise<void>;
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

export type UseScreenShareResult<TrackMetadata> = {
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

export type UseCameraAndMicrophoneResult<TrackMetadata> = {
  camera: UseCameraResult<TrackMetadata>;
  microphone: UseMicrophoneResult<TrackMetadata>;
  screenShare: UseScreenShareResult<TrackMetadata>;
  init: (config?: DeviceManagerConfig) => void;
  start: (config: UseUserMediaStartConfig) => void;
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
