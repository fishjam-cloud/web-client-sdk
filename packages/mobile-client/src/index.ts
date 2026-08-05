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
import './globals';

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
export { InMemoryDevicePersistence } from './devices/InMemoryDevicePersistence';
export {
  ReactNativeDeviceManager,
  type ReactNativeDeviceManagerOptions,
  type ReactNativeDisplayMediaOptions,
} from './devices/ReactNativeDeviceManager';
export type { IDevicePersistence } from '@fishjam-cloud/tsunami';
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

export { FishjamProvider, type FishjamProviderProps } from './FishjamProvider';
