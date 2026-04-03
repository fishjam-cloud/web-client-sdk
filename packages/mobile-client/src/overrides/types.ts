import type {
  CustomSource as ReactClientCustomSource,
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
import type { MediaStream as RNMediaStream } from '@fishjam-cloud/react-native-webrtc';

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

export type UseCameraResult = Omit<ReturnType<typeof useCameraReactClient>, 'cameraStream'> & {
  cameraStream: RNMediaStream | null;
};

export type UseMicrophoneResult = Omit<
  ReturnType<typeof useMicrophoneReactClient>,
  'toggleMicrophoneMute' | 'microphoneStream'
> & {
  microphoneStream: RNMediaStream | null;
};

export type UseScreenShareResult = Omit<ReturnType<typeof useScreenShareReactClient>, 'stream'> & {
  stream: RNMediaStream | null;
};

export type UseCustomSourceResult = Omit<ReturnType<typeof useCustomSourceReactClient>, 'stream' | 'setStream'> & {
  stream: RNMediaStream | undefined;
  setStream: (newStream: RNMediaStream | null) => void;
};

export type UseInitializeDevicesReturn = {
  initializeDevices: (
    ...args: Parameters<ReturnType<typeof useInitializeDevicesReactClient>['initializeDevices']>
  ) => Promise<InitializeDevicesResult>;
};

export type Track = Omit<ReactClientTrack, 'stream'> & { stream: RNMediaStream | null };

export type RemoteTrack = Omit<ReactClientRemoteTrack, 'stream'> & { stream: RNMediaStream | null };

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
