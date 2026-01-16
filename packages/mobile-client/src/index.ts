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
  useForegroundService,
} from '@fishjam-cloud/react-native-webrtc';

export type { CallKitAction, CallKitConfig, ForegroundServiceConfig } from '@fishjam-cloud/react-native-webrtc';

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

export function usePeers<PeerMetadata = Record<string, unknown>, ServerMetadata = Record<string, unknown>>(): {
  localPeer: PeerWithTracks<PeerMetadata, ServerMetadata> | null;
  remotePeers: PeerWithTracks<PeerMetadata, ServerMetadata>[];
  peers: PeerWithTracks<PeerMetadata, ServerMetadata>[];
} {
  const result = usePeersReactClient<PeerMetadata, ServerMetadata>();
  return {
    localPeer: result.localPeer as PeerWithTracks<PeerMetadata, ServerMetadata> | null,
    remotePeers: result.remotePeers as PeerWithTracks<PeerMetadata, ServerMetadata>[],
    peers: result.peers as PeerWithTracks<PeerMetadata, ServerMetadata>[],
  };
}

export function useCamera(): Omit<ReturnType<typeof useCameraReactClient>, 'cameraStream'> & {
  cameraStream: RNMediaStream | null;
} {
  const result = useCameraReactClient();
  return {
    ...result,
    cameraStream: result.cameraStream as RNMediaStream | null,
  };
}

export function useMicrophone(): Omit<ReturnType<typeof useMicrophoneReactClient>, 'microphoneStream'> & {
  microphoneStream: RNMediaStream | null;
} {
  const result = useMicrophoneReactClient();
  return {
    ...result,
    microphoneStream: result.microphoneStream as RNMediaStream | null,
  };
}

export function useLivestreamViewer(): Omit<ReturnType<typeof useLivestreamViewerReactClient>, 'stream'> & {
  stream: RNMediaStream | null;
} {
  const result = useLivestreamViewerReactClient();
  return {
    ...result,
    stream: result.stream as RNMediaStream | null,
  };
}

export function useLivestreamStreamer(): Omit<ReturnType<typeof useLivestreamStreamerReactClient>, 'connect'> & {
  connect: (config: ConnectStreamerConfig, urlOverride?: string) => Promise<void>;
} {
  const result = useLivestreamStreamerReactClient();
  return {
    ...result,
    connect: (config: ConnectStreamerConfig, urlOverride?: string) => {
      return result.connect(config as unknown as ReactClientConnectStreamerConfig, urlOverride);
    },
  };
}

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

import type {
  UseLivestreamViewerResult as ReactClientUseLivestreamViewerResult,
  StreamerInputs as ReactClientStreamerInputs,
  ConnectStreamerConfig as ReactClientConnectStreamerConfig,
} from '@fishjam-cloud/react-client';

export type UseLivestreamViewerResult = Omit<ReactClientUseLivestreamViewerResult, 'stream'> & {
  stream: RNMediaStream | null;
};

export type StreamerInputs =
  | {
      video: RNMediaStream;
      audio?: RNMediaStream | null;
    }
  | {
      video?: null;
      audio: RNMediaStream;
    };

export type ConnectStreamerConfig = {
  inputs: StreamerInputs;
  token: string;
};

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
  'tracks' | 'cameraTrack' | 'microphoneTrack' | 'screenShareVideoTrack' | 'screenShareAudioTrack' | 'customVideoTracks' | 'customAudioTracks'
> & {
  tracks: Track[];
  cameraTrack?: Track;
  microphoneTrack?: Track;
  screenShareVideoTrack?: Track;
  screenShareAudioTrack?: Track;
  customVideoTracks: Track[];
  customAudioTracks: Track[];
};
