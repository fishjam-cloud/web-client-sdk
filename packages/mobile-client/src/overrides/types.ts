import type {
  CustomSource as ReactClientCustomSource,
  DeviceError,
  InitializeDevicesResult as ReactClientInitializeDevicesResult,
  PeerWithTracks as ReactClientPeerWithTracks,
  RemoteTrack as ReactClientRemoteTrack,
  Track as ReactClientTrack,
  useCamera as useCameraReactClient,
  useCustomSource as useCustomSourceReactClient,
  useInitializeDevices as useInitializeDevicesReactClient,
  UseLivestreamStreamerResult as ReactClientUseLivestreamStreamerResult,
  UseLivestreamViewerResult as ReactClientUseLivestreamViewerResult,
  useMicrophone as useMicrophoneReactClient,
  useScreenShare as useScreenShareReactClient,
} from '@fishjam-cloud/react-client';
import type {
  MediaStream as RNMediaStream,
  MediaStreamTrack as RNMediaStreamTrack,
} from '@fishjam-cloud/react-native-webrtc';

export type StreamerInputs =
  | { video: RNMediaStream; audio?: RNMediaStream | null }
  | { video?: null; audio: RNMediaStream };

export type ConnectStreamerConfig = {
  inputs: StreamerInputs;
  token: string;
};

export type UseLivestreamStreamerResult = Omit<ReactClientUseLivestreamStreamerResult, 'connect'> & {
  connect: (config: ConnectStreamerConfig, urlOverride?: string) => Promise<void>;
};

export type UseLivestreamViewerResult = Omit<ReactClientUseLivestreamViewerResult, 'stream'> & {
  stream: RNMediaStream | null;
};

export type MiddlewareResult = { track: RNMediaStreamTrack; onClear?: () => void };

export type TrackMiddleware = ((track: RNMediaStreamTrack) => MiddlewareResult | Promise<MiddlewareResult>) | null;

export type TracksMiddlewareResult = {
  videoTrack: RNMediaStreamTrack;
  audioTrack: RNMediaStreamTrack | null;
  onClear: () => void;
};

export type TracksMiddleware = (
  videoTrack: RNMediaStreamTrack,
  audioTrack: RNMediaStreamTrack | null,
) => TracksMiddlewareResult | Promise<TracksMiddlewareResult>;

export type UseCameraResult = Omit<
  ReturnType<typeof useCameraReactClient>,
  'cameraStream' | 'startCamera' | 'currentCameraMiddleware' | 'setCameraTrackMiddleware'
> & {
  cameraStream: RNMediaStream | null;
  startCamera: (
    ...args: Parameters<ReturnType<typeof useCameraReactClient>['startCamera']>
  ) => Promise<[RNMediaStreamTrack, null] | [null, DeviceError]>;
  currentCameraMiddleware: TrackMiddleware;
  setCameraTrackMiddleware: (middleware: TrackMiddleware) => Promise<void>;
};

export type UseMicrophoneResult = Omit<
  ReturnType<typeof useMicrophoneReactClient>,
  | 'toggleMicrophoneMute'
  | 'microphoneStream'
  | 'startMicrophone'
  | 'currentMicrophoneMiddleware'
  | 'setMicrophoneTrackMiddleware'
> & {
  microphoneStream: RNMediaStream | null;
  startMicrophone: (
    ...args: Parameters<ReturnType<typeof useMicrophoneReactClient>['startMicrophone']>
  ) => Promise<[RNMediaStreamTrack, null] | [null, DeviceError]>;
  currentMicrophoneMiddleware: TrackMiddleware;
  setMicrophoneTrackMiddleware: (middleware: TrackMiddleware) => Promise<void>;
};

export type UseScreenShareResult = Omit<
  ReturnType<typeof useScreenShareReactClient>,
  'stream' | 'videoTrack' | 'audioTrack' | 'currentTracksMiddleware' | 'setTracksMiddleware'
> & {
  stream: RNMediaStream | null;
  videoTrack: RNMediaStreamTrack | null;
  audioTrack: RNMediaStreamTrack | null;
  currentTracksMiddleware: TracksMiddleware | null;
  setTracksMiddleware: (middleware: TracksMiddleware | null) => Promise<void>;
};

export type UseCustomSourceResult = Omit<ReturnType<typeof useCustomSourceReactClient>, 'stream' | 'setStream'> & {
  stream: RNMediaStream | undefined;
  setStream: (newStream: RNMediaStream | null) => Promise<void>;
};

export type UseInitializeDevicesReturn = {
  initializeDevices: (
    ...args: Parameters<ReturnType<typeof useInitializeDevicesReactClient>['initializeDevices']>
  ) => Promise<InitializeDevicesResult>;
};

export type Track = Omit<ReactClientTrack, 'stream' | 'track'> & {
  stream: RNMediaStream | null;
  track: RNMediaStreamTrack | null;
};

export type RemoteTrack = Omit<ReactClientRemoteTrack, 'stream' | 'track'> & {
  stream: RNMediaStream | null;
  track: RNMediaStreamTrack | null;
};

export type CustomSource<T extends string> = Omit<ReactClientCustomSource<T>, 'stream'> & { stream?: RNMediaStream };

export type InitializeDevicesResult = Omit<ReactClientInitializeDevicesResult, 'stream'> & {
  stream: RNMediaStream | null;
};

export type TrackFields =
  | 'tracks'
  | 'cameraTrack'
  | 'microphoneTrack'
  | 'screenShareVideoTrack'
  | 'screenShareAudioTrack'
  | 'customVideoTracks'
  | 'customAudioTracks';

export type PeerWithTracks<P, S, T extends Track = Track> = Omit<ReactClientPeerWithTracks<P, S>, TrackFields> & {
  tracks: T[];
  cameraTrack?: T;
  microphoneTrack?: T;
  screenShareVideoTrack?: T;
  screenShareAudioTrack?: T;
  customVideoTracks: T[];
  customAudioTracks: T[];
};
