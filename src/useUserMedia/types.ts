export type Type = "audio" | "video";

export type DeviceReturnType = "OK" | "Error" | "Not requested" | "Requesting";

export type Media = {
  stream: MediaStream | null;
  track: MediaStreamTrack | null;
  enabled: boolean;
  deviceInfo: MediaDeviceInfo | null;
};

export type DeviceState = {
  status: DeviceReturnType;
  media: Media | null;
  error: DeviceError | null;
  devices: MediaDeviceInfo[] | null;
};

export type UseUserMediaState = {
  video: DeviceState;
  audio: DeviceState;
};

export type UseUserMediaConfig = {
  videoTrackConstraints: boolean | MediaTrackConstraints;
  audioTrackConstraints: boolean | MediaTrackConstraints;
  fetchOnMount?: boolean;
  storage: boolean | DevicePersistence;
};

export type DevicePersistence = {
  getLastAudioDevice: () => MediaDeviceInfo | null;
  saveLastAudioDevice: (info: MediaDeviceInfo) => void;
  getLastVideoDevice: () => MediaDeviceInfo | null;
  saveLastVideoDevice: (info: MediaDeviceInfo) => void;
};

export type UseUserMediaStartConfig = {
  audioDeviceId?: string;
  videoDeviceId?: string;
};

export type UseUserMedia = {
  data: UseUserMediaState | null;
  start: (config: UseUserMediaStartConfig) => void;
  stop: (type: Type) => void;
  setEnable: (type: Type, value: boolean) => void;
  init: (videoParam: boolean | MediaTrackConstraints, audioParam: boolean | MediaTrackConstraints) => void;
};

export type DeviceError = { name: "OverconstrainedError" } | { name: "NotAllowedError" };

export type Errors = {
  audio?: DeviceError | null;
  video?: DeviceError | null;
};

export type GetMedia =
  | { stream: MediaStream; type: "OK"; constraints: MediaStreamConstraints; previousErrors: Errors }
  | { error: DeviceError | null; type: "Error"; constraints: MediaStreamConstraints };

export type CurrentDevices = { videoinput: MediaDeviceInfo | null; audioinput: MediaDeviceInfo | null };
