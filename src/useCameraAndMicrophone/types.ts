import { SimulcastConfig, TrackBandwidthLimit } from "@jellyfish-dev/ts-client-sdk";
import { DeviceError, DevicePersistence, DeviceReturnType, UseUserMediaStartConfig } from "../useUserMedia/types";
import { Track } from "../state.types";

export type UseSetupCameraAndMicrophoneConfig<TrackMetadata> = {
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
  startOnMount?: boolean;
  storage?: boolean | DevicePersistence;
};

export type UseSetupCameraAndMicrophoneResult = {
  init: () => void;
  start: (config: UseUserMediaStartConfig) => void;
};

export type UseCameraResult<TrackMetadata> = {
  stop: () => void;
  setEnable: (value: boolean) => void;
  start: () => void;
  addTrack: (
    trackMetadata?: TrackMetadata,
    simulcastConfig?: SimulcastConfig,
    maxBandwidth?: TrackBandwidthLimit
  ) => void;
  removeTrack: () => void;
  replaceTrack: (newTrack: MediaStreamTrack, stream: MediaStream, newTrackMetadata?: TrackMetadata) => Promise<boolean>;
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
  start: () => void;
  addTrack: (trackMetadata?: TrackMetadata, maxBandwidth?: TrackBandwidthLimit) => void;
  removeTrack: () => void;
  replaceTrack: (newTrack: MediaStreamTrack, stream: MediaStream, newTrackMetadata?: TrackMetadata) => Promise<boolean>;
  broadcast: Track<TrackMetadata> | null;
  status: DeviceReturnType | null;
  stream: MediaStream | null;
  track: MediaStreamTrack | null;
  enabled: boolean;
  deviceInfo: MediaDeviceInfo | null;
  error: DeviceError | null;
  devices: MediaDeviceInfo[] | null;
};

export type UseCameraAndMicrophoneResult<TrackMetadata> = {
  camera: UseCameraResult<TrackMetadata>;
  microphone: UseMicrophoneResult<TrackMetadata>;
  init: () => void;
  start: (config: UseUserMediaStartConfig) => void;
};
