/* eslint-disable simple-import-sort/imports */
/* eslint-disable import/no-duplicates */
/* eslint-disable simple-import-sort/exports */
/* eslint-disable import/first */
// TODO: FCE-2464 Investigate order
import './webrtc-polyfill';
import React from 'react';
import {
  FishjamProvider as ReactClientFishjamProvider,
  type FishjamProviderProps as ReactClientFishjamProviderProps,
  type Track as ReactClientTrack,
  type PeerWithTracks as ReactClientPeerWithTracks,
} from '@fishjam-cloud/react-client';

import type { MediaStream as RNMediaStream } from '@fishjam-cloud/react-native-webrtc';

export {
  RTCView,
  ScreenCapturePickerView,
  MediaStream,
  startPIP,
  stopPIP,
  RTCPIPView,
  useCallKit,
  useCallKitEvent,
  useCallKitService,
} from '@fishjam-cloud/react-native-webrtc';

export type { CallKitAction, CallKitConfig } from '@fishjam-cloud/react-native-webrtc';

export { useForegroundService, type ForegroundServiceConfig } from './useForegroundService';

export {
  useInitializeDevices,
  InitializeDevicesSettings,
  useConnection,
  useCustomSource,
  useSandbox,
  useScreenShare,
  useUpdatePeerMetadata,
  useVAD,
  Variant,
} from '@fishjam-cloud/react-client';

import {
  usePeers as usePeersReactClient,
  useCamera as useCameraReactClient,
  useMicrophone as useMicrophoneReactClient,
  useLivestreamViewer as useLivestreamViewerReactClient,
  useLivestreamStreamer as useLivestreamStreamerReactClient,
} from '@fishjam-cloud/react-client';

import type {
  UseLivestreamViewerResult as ReactClientUseLivestreamViewerResult,
  StreamerInputs as ReactClientStreamerInputs,
  ConnectStreamerConfig as ReactClientConnectStreamerConfig,
} from '@fishjam-cloud/react-client';

export type UseLivestreamViewerResult = Omit<ReactClientUseLivestreamViewerResult, 'stream'> & {
  stream: RNMediaStream | null;
};

export type StreamerInputs =
  | (Omit<ReactClientStreamerInputs, 'video' | 'audio'> & {
      video: RNMediaStream;
      audio?: RNMediaStream | null;
    })
  | (Omit<ReactClientStreamerInputs, 'video' | 'audio'> & {
      video?: null;
      audio: RNMediaStream;
    });

export type ConnectStreamerConfig = Omit<ReactClientConnectStreamerConfig, 'inputs'> & {
  inputs: StreamerInputs;
};

export const usePeers = usePeersReactClient as <
  PeerMetadata = Record<string, unknown>,
  ServerMetadata = Record<string, unknown>,
>() => Omit<ReturnType<typeof usePeersReactClient>, 'localPeer' | 'remotePeers' | 'peers'> & {
  localPeer: PeerWithTracks<PeerMetadata, ServerMetadata> | null;
  remotePeers: PeerWithTracks<PeerMetadata, ServerMetadata>[];
  peers: PeerWithTracks<PeerMetadata, ServerMetadata>[];
};

export const useCamera = useCameraReactClient as () => Omit<ReturnType<typeof useCameraReactClient>, 'cameraStream'> & {
  cameraStream: RNMediaStream | null;
};

export const useMicrophone = useMicrophoneReactClient as () => Omit<
  ReturnType<typeof useMicrophoneReactClient>,
  'microphoneStream'
> & {
  microphoneStream: RNMediaStream | null;
};

export const useLivestreamViewer = useLivestreamViewerReactClient as () => Omit<
  ReturnType<typeof useLivestreamViewerReactClient>,
  'stream'
> & {
  stream: RNMediaStream | null;
};

export const useLivestreamStreamer = useLivestreamStreamerReactClient as unknown as () => Omit<
  ReturnType<typeof useLivestreamStreamerReactClient>,
  'connect'
> & {
  connect: (config: ConnectStreamerConfig, urlOverride?: string) => Promise<void>;
};

export type {
  UseInitializeDevicesParams,
  JoinRoomConfig,
  UseLivestreamStreamerResult,
  ConnectViewerConfig,
  RoomType,
  UseSandboxProps,
  BandwidthLimits,
  Brand,
  CustomSource,
  DeviceError,
  DeviceItem,
  InitializeDevicesResult,
  InitializeDevicesStatus,
  MiddlewareResult,
  PeerId,
  PeerStatus,
  PersistLastDeviceHandlers,
  SimulcastBandwidthLimits,
  StreamConfig,
  TrackId,
  TrackMiddleware,
  TracksMiddleware,
  TracksMiddlewareResult,
  AuthErrorReason,
  JoinErrorReason,
  Metadata,
  ReconnectConfig,
  ReconnectionStatus,
  SimulcastBandwidthLimit,
  SimulcastConfig,
  TrackBandwidthLimit,
} from '@fishjam-cloud/react-client';

// persistLastDevice is not supported on mobile
export type FishjamProviderProps = Omit<ReactClientFishjamProviderProps, 'persistLastDevice'>;
export function FishjamProvider(props: FishjamProviderProps) {
  return React.createElement(ReactClientFishjamProvider, {
    ...props,
    persistLastDevice: false,
  });
}

export type Track = Omit<ReactClientTrack, 'stream'> & { stream: RNMediaStream | null };

export type PeerWithTracks<PeerMetadata, ServerMetadata> = Omit<
  ReactClientPeerWithTracks<PeerMetadata, ServerMetadata>,
  | 'tracks'
  | 'cameraTrack'
  | 'microphoneTrack'
  | 'screenShareVideoTrack'
  | 'screenShareAudioTrack'
  | 'customVideoTracks'
  | 'customAudioTracks'
> & {
  tracks: Track[];
  cameraTrack?: Track;
  microphoneTrack?: Track;
  screenShareVideoTrack?: Track;
  screenShareAudioTrack?: Track;
  customVideoTracks: Track[];
  customAudioTracks: Track[];
};
