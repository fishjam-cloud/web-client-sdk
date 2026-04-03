import {
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
  UseLivestreamStreamerResult,
  UseLivestreamViewerResult,
} from './types';

/**
 * This hook can toggle camera on/off, change camera, provides current camera and other.
 * @category Devices
 */
export function useCamera() {
  const result = useCameraReactClient();
  return {
    ...result,
    cameraStream: result.cameraStream as RNMediaStream | null,
  };
}

/**
 * Manage microphone
 * @category Devices
 */
export function useMicrophone() {
  const { toggleMicrophoneMute: _, ...rest } = useMicrophoneReactClient();
  return {
    ...rest,
    microphoneStream: rest.microphoneStream as RNMediaStream | null,
  };
}

/**
 * Hook to enable screen sharing within a room and manage the existing stream.
 * @category Screenshare
 */
export function useScreenShare() {
  const result = useScreenShareReactClient();
  return {
    ...result,
    stream: result.stream as RNMediaStream | null,
  };
}

/**
 * This hook can register/deregister a custom MediaStream with Fishjam.
 * @group Hooks
 */
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

/**
 * Hook allows you to initialize access to the devices before joining the room.
 * @category Devices
 */
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

/**
 * Hook for fine-grained control over CallKit sessions on iOS.
 * @category CallKit
 */
export function useCallKit() {
  const result = useCallKitRNWebRTC();
  return { ...result };
}

/**
 * Hook for automatic CallKit session lifecycle management on iOS.
 * @category CallKit
 */
export function useCallKitService(config: CallKitConfig) {
  return useCallKitServiceRNWebRTC(config);
}

/**
 * Hook to listen to CallKit events on iOS.
 * @category CallKit
 */
export function useCallKitEvent<T extends keyof CallKitAction>(action: T, callback: (event: CallKitAction[T]) => void) {
  return useCallKitEventRNWebRTC(action, callback);
}
