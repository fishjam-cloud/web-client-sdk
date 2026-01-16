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

import type { MediaStream } from '@fishjam-cloud/react-native-webrtc';

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
  useCamera,
  useInitializeDevices,
  useMicrophone,
  InitializeDevicesSettings,
  useConnection,
  useCustomSource,
  useLivestreamStreamer,
  useLivestreamViewer,
  useSandbox,
  useScreenShare,
  useUpdatePeerMetadata,
  useVAD,
  Variant,
} from '@fishjam-cloud/react-client';

import { usePeers as usePeersReactClient } from '@fishjam-cloud/react-client';

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

export type {
  UseInitializeDevicesParams,
  JoinRoomConfig,
  ConnectStreamerConfig,
  StreamerInputs,
  UseLivestreamStreamerResult,
  ConnectViewerConfig,
  UseLivestreamViewerResult,
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

export type Track = Omit<ReactClientTrack, 'stream'> & { stream: MediaStream | null };

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
