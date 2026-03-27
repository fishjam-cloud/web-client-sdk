import {
  useCamera as useCameraReactClient,
  useCustomSource as useCustomSourceReactClient,
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
  UseLivestreamStreamerResult,
  UseLivestreamViewerResult,
} from './types';

export const useCamera = useCameraReactClient as () => Omit<ReturnType<typeof useCameraReactClient>, 'cameraStream'> & {
  cameraStream: RNMediaStream | null;
};

export const useMicrophone = useMicrophoneReactClient as () => Omit<
  ReturnType<typeof useMicrophoneReactClient>,
  'toggleMicrophoneMute' | 'microphoneStream'
> & {
  microphoneStream: RNMediaStream | null;
};

export const useScreenShare = useScreenShareReactClient as () => Omit<
  ReturnType<typeof useScreenShareReactClient>,
  'stream'
> & {
  stream: RNMediaStream | null;
};

export const useCustomSource = useCustomSourceReactClient as <T extends string>(
  sourceId: T,
) => Omit<ReturnType<typeof useCustomSourceReactClient>, 'stream' | 'setStream'> & {
  stream: RNMediaStream | undefined;
  setStream: (newStream: RNMediaStream | null) => void;
};

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

export function usePeers<P = Record<string, unknown>, S = Record<string, unknown>>() {
  return usePeersReactClient<P, S>() as unknown as {
    localPeer: PeerWithTracks<P, S> | null;
    remotePeers: PeerWithTracks<P, S>[];
    peers: PeerWithTracks<P, S>[];
  };
}
