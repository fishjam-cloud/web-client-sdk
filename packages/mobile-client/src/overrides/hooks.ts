import {
  type TrackMiddleware as ReactTrackMiddleware,
  type TracksMiddleware as ReactTracksMiddleware,
  useCamera as useCameraReactClient,
  useCustomSource as useCustomSourceReactClient,
  useInitializeDevices as useInitializeDevicesReactClient,
  useLivestreamStreamer as useLivestreamStreamerReactClient,
  useLivestreamViewer as useLivestreamViewerReactClient,
  useMicrophone as useMicrophoneReactClient,
  usePeers as usePeersReactClient,
  useScreenShare as useScreenShareReactClient,
} from '@fishjam-cloud/react-client';
import type { CallKitAction, CallKitConfig, MediaStream as RNMediaStream } from '@fishjam-cloud/react-native-webrtc';
import {
  presentBroadcastPicker,
  useCallKit as useCallKitRNWebRTC,
  useCallKitEvent as useCallKitEventRNWebRTC,
  useCallKitService as useCallKitServiceRNWebRTC,
} from '@fishjam-cloud/react-native-webrtc';
import { useCallback } from 'react';

import type {
  ConnectStreamerConfig,
  InitializeDevicesResult,
  PeerWithTracks,
  RemoteTrack,
  TrackMiddleware,
  TracksMiddleware,
  UseCameraResult,
  UseLivestreamStreamerResult,
  UseLivestreamViewerResult,
  UseMicrophoneResult,
  UseScreenShareResult,
} from './types';

export function useCamera(): UseCameraResult {
  const result = useCameraReactClient();
  const { setCameraTrackMiddleware: setCameraTrackMiddlewareReact } = result;
  const setCameraTrackMiddleware = useCallback(
    (middleware: TrackMiddleware) => setCameraTrackMiddlewareReact(middleware as ReactTrackMiddleware),
    [setCameraTrackMiddlewareReact],
  );
  return {
    ...result,
    cameraStream: result.cameraStream as RNMediaStream | null,
    startCamera: result.startCamera as UseCameraResult['startCamera'],
    currentCameraMiddleware: result.currentCameraMiddleware as TrackMiddleware,
    setCameraTrackMiddleware,
  };
}

export function useMicrophone(): UseMicrophoneResult {
  const { toggleMicrophoneMute: _, ...rest } = useMicrophoneReactClient();
  const { setMicrophoneTrackMiddleware: setMicrophoneTrackMiddlewareReact } = rest;
  const setMicrophoneTrackMiddleware = useCallback(
    (middleware: TrackMiddleware) => setMicrophoneTrackMiddlewareReact(middleware as ReactTrackMiddleware),
    [setMicrophoneTrackMiddlewareReact],
  );
  return {
    ...rest,
    microphoneStream: rest.microphoneStream as RNMediaStream | null,
    startMicrophone: rest.startMicrophone as UseMicrophoneResult['startMicrophone'],
    currentMicrophoneMiddleware: rest.currentMicrophoneMiddleware as TrackMiddleware,
    setMicrophoneTrackMiddleware,
  };
}

export function useScreenShare(): UseScreenShareResult {
  const result = useScreenShareReactClient();
  const { setTracksMiddleware: setTracksMiddlewareReact } = result;
  const setTracksMiddleware = useCallback(
    (middleware: TracksMiddleware | null) => setTracksMiddlewareReact(middleware as ReactTracksMiddleware | null),
    [setTracksMiddlewareReact],
  );
  return {
    ...result,
    stream: result.stream as RNMediaStream | null,
    videoTrack: result.videoTrack as UseScreenShareResult['videoTrack'],
    audioTrack: result.audioTrack as UseScreenShareResult['audioTrack'],
    currentTracksMiddleware: result.currentTracksMiddleware as TracksMiddleware | null,
    setTracksMiddleware,
    presentBroadcastPicker,
  };
}

export function useCustomSource<T extends string>(sourceId: T) {
  const result = useCustomSourceReactClient(sourceId);
  return {
    ...result,
    stream: result.stream as RNMediaStream | undefined,
    setStream: result.setStream as (newStream: RNMediaStream | null) => Promise<void>,
  };
}

export function useLivestreamStreamer(): UseLivestreamStreamerResult {
  const { connect: reactConnect, ...rest } = useLivestreamStreamerReactClient();

  const connect = useCallback(
    async (config: ConnectStreamerConfig, urlOverride?: string) => {
      // @ts-expect-error RNMediaStream is MediaStream at runtime via webrtc polyfill
      await reactConnect(config, urlOverride);
    },
    [reactConnect],
  );

  return { ...rest, connect };
}

export function useLivestreamViewer(): UseLivestreamViewerResult {
  const { stream, ...rest } = useLivestreamViewerReactClient();
  return {
    ...rest,
    stream: stream as unknown as RNMediaStream | null,
  };
}

export function useInitializeDevices() {
  const { initializeDevices: reactInitDevices } = useInitializeDevicesReactClient();
  return {
    initializeDevices: reactInitDevices as (
      ...args: Parameters<typeof reactInitDevices>
    ) => Promise<InitializeDevicesResult>,
  };
}

export function usePeers<P = Record<string, unknown>, S = Record<string, unknown>>() {
  return usePeersReactClient<P, S>() as unknown as {
    localPeer: PeerWithTracks<P, S> | null;
    remotePeers: PeerWithTracks<P, S, RemoteTrack>[];
    peers: PeerWithTracks<P, S, RemoteTrack>[];
  };
}

export function useCallKit() {
  const result = useCallKitRNWebRTC();
  return { ...result };
}

export function useCallKitService(config: CallKitConfig) {
  return useCallKitServiceRNWebRTC(config);
}

export function useCallKitEvent<T extends keyof CallKitAction>(action: T, callback: (event: CallKitAction[T]) => void) {
  return useCallKitEventRNWebRTC(action, callback);
}
