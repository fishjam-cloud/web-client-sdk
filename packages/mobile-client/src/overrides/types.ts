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
  LivestreamStatus,
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

export type StartLivestreamScreenShareConfig = {
  /** Streamer token used to authenticate with Fishjam WHIP. */
  token: string;
  /** Optional full WHIP URL; defaults to the URL derived from the FishjamProvider's Fishjam ID. */
  urlOverride?: string;
};

export type UseLivestreamScreenShareResult = {
  /**
   * Starts a background-tolerant screen-share livestream.
   * - iOS: writes WHIP credentials for the broadcast extension and presents the system picker.
   * - Android: starts in-app screen capture (kept alive by the foreground service) and publishes.
   */
  startScreenShareLivestream: (config: StartLivestreamScreenShareConfig) => Promise<void>;
  /**
   * Stops the livestream.
   * - iOS: presents the system "Stop Broadcast" sheet.
   * - Android: disconnects the publisher and stops capture.
   */
  stopScreenShareLivestream: () => Promise<void>;
  /** Current livestream lifecycle status. */
  status: LivestreamStatus;
  /** Failure reason when `status === 'failed'`, otherwise `null`. */
  error: string | null;
  /** Convenience flag: `true` when the extension reports media is flowing. */
  isStreaming: boolean;
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
  /**
   * iOS only. Presents the system `RPSystemBroadcastPickerView`. When a
   * broadcast is active, this opens the system "Stop Broadcast" sheet so
   * the user can end it cleanly (via `broadcastFinished()`) and avoid the
   * "Screen sharing stopped" error dialog that `stopStreaming` triggers
   * by force-closing the host-side socket. No-op on non-iOS.
   */
  presentBroadcastPicker: () => Promise<void>;
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
