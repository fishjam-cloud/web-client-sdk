import type {
  CustomSource as ReactClientCustomSource,
  InitializeDevicesResult as ReactClientInitializeDevicesResult,
  Track as ReactClientTrack,
  UseLivestreamStreamerResult as ReactClientUseLivestreamStreamerResult,
  UseLivestreamViewerResult as ReactClientUseLivestreamViewerResult,
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

export type Track = Omit<ReactClientTrack, 'stream'> & { stream: RNMediaStream | null };

export type CustomSource<T extends string> = Omit<ReactClientCustomSource<T>, 'stream'> & { stream?: RNMediaStream };

export type InitializeDevicesResult = Omit<ReactClientInitializeDevicesResult, 'stream'> & {
  stream: RNMediaStream | null;
};
