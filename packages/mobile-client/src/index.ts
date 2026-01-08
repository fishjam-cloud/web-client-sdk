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

export {
  RTCView,
  ScreenCapturePickerView,
  MediaStream,
  startPIP,
  stopPIP,
  RTCPIPView,
} from '@fishjam-cloud/react-native-webrtc';

export {
  useCamera,
  useInitializeDevices,
  useMicrophone,
  InitializeDevicesSettings,
  useConnection,
  useCustomSource,
  useLivestreamStreamer,
  useLivestreamViewer,
  usePeers,
  useSandbox,
  useScreenShare,
  useUpdatePeerMetadata,
  useVAD,
  Variant,
} from '@fishjam-cloud/react-client';

export type {
  UseInitializeDevicesParams,
  JoinRoomConfig,
  ConnectStreamerConfig,
  StreamerInputs,
  UseLivestreamStreamerResult,
  ConnectViewerConfig,
  UseLivestreamViewerResult,
  PeerWithTracks,
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
  Track,
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
  return React.createElement(ReactClientFishjamProvider, props);
}
