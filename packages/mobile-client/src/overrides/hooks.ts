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
import type { MediaStream as RNMediaStream } from '@fishjam-cloud/react-native-webrtc';
import { useCallback } from 'react';

import type {
  ConnectStreamerConfig,
  PeerWithTracks,
  RemoteTrack,
  UseCameraResult,
  UseCustomSourceResult,
  UseInitializeDevicesReturn,
  UseLivestreamStreamerResult,
  UseLivestreamViewerResult,
  UseMicrophoneResult,
  UseScreenShareResult,
} from './types';

export const useCamera = useCameraReactClient as () => UseCameraResult;

export const useMicrophone = useMicrophoneReactClient as () => UseMicrophoneResult;

export const useScreenShare = useScreenShareReactClient as () => UseScreenShareResult;

export const useCustomSource = useCustomSourceReactClient as <T extends string>(sourceId: T) => UseCustomSourceResult;

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

export const useInitializeDevices = useInitializeDevicesReactClient as () => UseInitializeDevicesReturn;

export function usePeers<P = Record<string, unknown>, S = Record<string, unknown>>() {
  return usePeersReactClient<P, S>() as unknown as {
    localPeer: PeerWithTracks<P, S> | null;
    remotePeers: PeerWithTracks<P, S, RemoteTrack>[];
    peers: PeerWithTracks<P, S, RemoteTrack>[];
  };
}
