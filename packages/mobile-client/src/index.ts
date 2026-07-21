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

import { VoipProvider, type VoipConfig } from './voip/VoipProvider';

export { RTCView, RTCPIPView, type RTCVideoViewProps, type RTCPIPViewProps } from './overrides/RTCView';
export {
  ScreenCapturePickerView,
  startPIP,
  stopPIP,
  AudioDeviceType,
  useAudioOutput,
  useVoIPEvents,
  useTelecom,
  useTelecomEvent,
  fulfillIncomingCallConnected,
  failIncomingCallConnected,
  getPendingAnswerRequestId,
  reportOutgoingCallConnected,
  setCallHeld,
  setCallMuted,
  isCallHeld,
} from '@fishjam-cloud/react-native-webrtc';

export type { VoIPEventHandlers, VoipCallIntent, VoipIncomingPayload } from '@fishjam-cloud/react-native-webrtc';

export { useVoip } from './voip/VoipContext';
export type { VoipConfig } from './voip/VoipProvider';
export type { CurrentCall, VoipCallStatus, VoipContextValue } from './voip/VoipContext';

export type {
  CallEndedReason,
  TelecomConfig,
  TelecomEvent,
  TelecomEventType,
  UseTelecomResult,
} from '@fishjam-cloud/react-native-webrtc';

export type {
  CallKitAction,
  CallKitConfig,
  MediaStream,
  MediaStreamTrack,
  AudioDevice,
  AudioOutputChangedInfo,
  UseAudioOutputResult,
} from '@fishjam-cloud/react-native-webrtc';

export { useForegroundService, type ForegroundServiceConfig } from './useForegroundService';
export { useCameraPermissions, useMicrophonePermissions, type PermissionStatus } from './hooks/usePermissions';

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
export type FishjamProviderProps = Omit<ReactClientFishjamProviderProps, 'persistLastDevice' | 'fishjamClient'> & {
  /**
   * Enables native VoIP calls (iOS CallKit / Android Telecom). When set, the VoIP
   * call machine is mounted inside the provider and the {@link useVoip} hook becomes
   * available. Omit it and VoIP stays off — no native call listeners are registered.
   */
  voip?: VoipConfig;
};

export function FishjamProvider({ voip, children, ...rest }: FishjamProviderProps) {
  const fishjamClient = new FishjamClient({
    reconnect: rest.reconnect,
    debug: rest.debug,
    clientType: 'mobile',
  });

  // Mount the VoIP call machine only when configured (the `voip` prop is set), so
  // plain video apps pay nothing and no native CallKit/Telecom listeners register.
  return React.createElement(
    ReactClientFishjamProvider,
    { ...rest, persistLastDevice: false, fishjamClient },
    voip ? React.createElement(VoipProvider, voip, children) : children,
  );
}
