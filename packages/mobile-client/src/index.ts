/**
 * React Native client SDK for building mobile video and audio apps with Fishjam.
 *
 * @packageDocumentation
 */
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
} from '@fishjam-cloud/react-client';
import { FishjamClient } from '@fishjam-cloud/ts-client';

export { RTCView, RTCPIPView, type RTCVideoViewProps, type RTCPIPViewProps } from './overrides/RTCView';
export {
  ScreenCapturePickerView,
  startPIP,
  stopPIP,
  AudioDeviceType,
  useAudioOutput,
  pushAudioSamples,
} from '@fishjam-cloud/react-native-webrtc';

export type {
  CallKitAction,
  CallKitConfig,
  CustomAudioSink,
  CustomAudioTrack,
  MediaStream,
  MediaStreamTrack,
  AudioDevice,
  AudioOutputChangedInfo,
  UseAudioOutputResult,
} from '@fishjam-cloud/react-native-webrtc';

export { useForegroundService, type ForegroundServiceConfig } from './useForegroundService';
export { useCameraPermissions, useMicrophonePermissions, type PermissionStatus } from './hooks/usePermissions';
export {
  useCustomAudioSource,
  type UseCustomAudioSourceOptions,
  type UseCustomAudioSourceResult,
} from './hooks/useCustomAudioSource';

export {
  InitializeDevicesSettings,
  useConnection,
  useDataChannel,
  useSandbox,
  useUpdatePeerMetadata,
  useVAD,
  Variant,
} from '@fishjam-cloud/react-client';

export {
  useCamera,
  useInitializeDevices,
  useMicrophone,
  useScreenShare,
  useCustomSource,
  useLivestreamStreamer,
  useLivestreamViewer,
  usePeers,
  useCallKit,
  useCallKitEvent,
  useCallKitService,
} from './overrides/hooks';

export type {
  StreamerInputs,
  ConnectStreamerConfig,
  UseLivestreamStreamerResult,
  UseLivestreamViewerResult,
  UseCameraResult,
  UseMicrophoneResult,
  UseScreenShareResult,
  UseCustomSourceResult,
  UseInitializeDevicesReturn,
  Track,
  RemoteTrack,
  CustomSource,
  InitializeDevicesResult,
  PeerWithTracks,
  TrackFields,
  MiddlewareResult,
  TrackMiddleware,
  TracksMiddleware,
  TracksMiddlewareResult,
} from './overrides/types';

export type {
  UseInitializeDevicesParams,
  JoinRoomConfig,
  ConnectViewerConfig,
  RoomType,
  UseSandboxProps,
  BandwidthLimits,
  Brand,
  DeviceError,
  DeviceItem,
  InitializeDevicesStatus,
  PeerId,
  PeerStatus,
  PersistLastDeviceHandlers,
  SimulcastBandwidthLimits,
  StreamConfig,
  TrackId,
  AuthErrorReason,
  JoinErrorReason,
  UseDataChannelResult,
  DataCallback,
  DataChannelOptions,
  Metadata,
  ReconnectConfig,
  ReconnectionStatus,
  SimulcastBandwidthLimit,
  SimulcastConfig,
  TrackBandwidthLimit,
} from '@fishjam-cloud/react-client';

// persistLastDevice is not supported on mobile
export type FishjamProviderProps = Omit<ReactClientFishjamProviderProps, 'persistLastDevice' | 'fishjamClient'>;
export function FishjamProvider(props: FishjamProviderProps) {
  const fishjamClient = new FishjamClient({ reconnect: props.reconnect, debug: props.debug, clientType: 'mobile' });
  return React.createElement(ReactClientFishjamProvider, {
    ...props,
    persistLastDevice: false,
    fishjamClient,
  });
}
