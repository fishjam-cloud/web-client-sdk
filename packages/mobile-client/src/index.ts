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
  useMicrophone as useMicrophoneReactClient,
} from '@fishjam-cloud/react-client';

import { mergeMobileAudioConstraints } from './constraints';

export { RTCView, RTCPIPView, type RTCVideoViewProps, type RTCPIPViewProps } from './overrides/RTCView';

export {
  ScreenCapturePickerView,
  startPIP,
  stopPIP,
  useCallKit,
  useCallKitEvent,
  useCallKitService,
} from '@fishjam-cloud/react-native-webrtc';

export type { CallKitAction, CallKitConfig, MediaStream } from '@fishjam-cloud/react-native-webrtc';

export { useForegroundService, type ForegroundServiceConfig } from './useForegroundService';

export { DEFAULT_MOBILE_AUDIO_CONSTRAINTS } from './constraints';
export type { ExtendedMediaTrackConstraints } from './constraints';

export {
  useCamera,
  useInitializeDevices,
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

export const useMicrophone = useMicrophoneReactClient as () => Omit<
  ReturnType<typeof useMicrophoneReactClient>,
  'toggleMicrophoneMute'
>;

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
  const mergedConstraints = React.useMemo(() => {
    return {
      ...props.constraints,
      audio: mergeMobileAudioConstraints(props.constraints?.audio),
    };
  }, [props.constraints?.audio, props.constraints?.video]);

  return React.createElement(ReactClientFishjamProvider, {
    ...props,
    constraints: mergedConstraints,
    persistLastDevice: false,
  });
}
