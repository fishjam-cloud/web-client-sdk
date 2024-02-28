import { SimulcastConfig, TrackBandwidthLimit } from "@jellyfish-dev/ts-client-sdk";
import { DeviceError, DevicePersistence, DeviceReturnType, UseUserMediaStartConfig } from "../useUserMedia/types";
import { Track } from "../state.types";

export type UseSetupMediaConfig<TrackMetadata> = {
  camera: {
    autoStreaming?: boolean;
    preview?: boolean;
    trackConstraints: boolean | MediaTrackConstraints;
    defaultTrackMetadata?: TrackMetadata;
    defaultSimulcastConfig?: SimulcastConfig;
    defaultMaxBandwidth?: TrackBandwidthLimit;
  };
  microphone: {
    autoStreaming?: boolean;
    preview?: boolean;
    trackConstraints: boolean | MediaTrackConstraints;
    defaultTrackMetadata?: TrackMetadata;
    defaultMaxBandwidth?: TrackBandwidthLimit;
  };
  screenshare: {
    autoStreaming?: boolean;
    preview?: boolean;
    trackConstraints: boolean | MediaTrackConstraints;
    defaultTrackMetadata?: TrackMetadata;
    defaultMaxBandwidth?: TrackBandwidthLimit;
  };
  startOnMount?: boolean;
  storage?: boolean | DevicePersistence;
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
  replaceTrack: (newTrack: MediaStreamTrack, stream: MediaStream, newTrackMetadata?: TrackMetadata) => Promise<void>;
  broadcast: Track<TrackMetadata> | null;
  status: DeviceReturnType | null; // todo how to remove null
  stream: MediaStream | null;
  track: MediaStreamTrack | null;
  enabled: boolean;
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
  replaceTrack: (newTrack: MediaStreamTrack, stream: MediaStream, newTrackMetadata?: TrackMetadata) => Promise<void>;
  broadcast: Track<TrackMetadata> | null;
  status: DeviceReturnType | null;
  stream: MediaStream | null;
  track: MediaStreamTrack | null;
  enabled: boolean;
  deviceInfo: MediaDeviceInfo | null;
  error: DeviceError | null;
  devices: MediaDeviceInfo[] | null;
};

export type UseScreenshareResult<TrackMetadata> = {
  stop: () => void;
  setEnable: (value: boolean) => void;
  start: () => void;
  addTrack: (trackMetadata?: TrackMetadata, maxBandwidth?: TrackBandwidthLimit) => Promise<string>;
  removeTrack: () => Promise<void>;
  replaceTrack: (newTrack: MediaStreamTrack, stream: MediaStream, newTrackMetadata?: TrackMetadata) => Promise<void>;
  broadcast: Track<TrackMetadata> | null;
  status: DeviceReturnType | null;
  stream: MediaStream | null;
  track: MediaStreamTrack | null;
  enabled: boolean;
  error: DeviceError | null;
};

export type UseCameraAndMicrophoneResult<TrackMetadata> = {
  camera: UseCameraResult<TrackMetadata>;
  microphone: UseMicrophoneResult<TrackMetadata>;
  screenshare: UseScreenshareResult<TrackMetadata>;
  init: () => void;
  start: (config: UseUserMediaStartConfig) => void;
};
