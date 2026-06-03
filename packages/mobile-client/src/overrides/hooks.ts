import {
  buildLivestreamWhipUrl,
  type TrackMiddleware as ReactTrackMiddleware,
  type TracksMiddleware as ReactTracksMiddleware,
  useCamera as useCameraReactClient,
  useCustomSource as useCustomSourceReactClient,
  useFishjamId,
  useInitializeDevices as useInitializeDevicesReactClient,
  useLivestreamStreamer as useLivestreamStreamerReactClient,
  useLivestreamViewer as useLivestreamViewerReactClient,
  useMicrophone as useMicrophoneReactClient,
  usePeers as usePeersReactClient,
  useScreenShare as useScreenShareReactClient,
} from '@fishjam-cloud/react-client';
import type {
  CallKitAction,
  CallKitConfig,
  LivestreamStatus,
  MediaStream as RNMediaStream,
} from '@fishjam-cloud/react-native-webrtc';
import {
  presentBroadcastPicker,
  presentLivestreamBroadcastPicker,
  useCallKit as useCallKitRNWebRTC,
  useCallKitEvent as useCallKitEventRNWebRTC,
  useCallKitService as useCallKitServiceRNWebRTC,
  useLivestreamStatus,
  writeLivestreamCredentials,
} from '@fishjam-cloud/react-native-webrtc';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type {
  ConnectStreamerConfig,
  InitializeDevicesResult,
  PeerWithTracks,
  RemoteTrack,
  StartLivestreamScreenShareConfig,
  TrackMiddleware,
  TracksMiddleware,
  UseCameraResult,
  UseLivestreamScreenShareResult,
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

/**
 * Hook for publishing a screen-share livestream that keeps running while the app is
 * backgrounded (iOS only). Unlike {@link useLivestreamStreamer} (which publishes from the
 * foreground app process), the WHIP credentials are handed to a dedicated broadcast
 * extension which owns the WebRTC pipeline in-process, so streaming survives backgrounding.
 *
 * Requires `ios.enableLivestreamScreensharing` in the config plugin. On Android and on iOS
 * without the extension, the picker is a no-op.
 */
/**
 * Cross-platform background screen-share livestream.
 *
 * The call site and the `status` contract are identical on both platforms, but the
 * implementation differs because the constraints differ:
 * - **iOS**: VideoToolbox's encoder is unavailable while the app is backgrounded, and the
 *   ReplayKit broadcast extension is the only process iOS keeps alive — so the WebRTC
 *   pipeline runs in that extension. We hand it the WHIP credentials via the App Group and
 *   present the system broadcast picker; status comes back over the cross-process channel
 *   ({@link useLivestreamStatus}).
 * - **Android**: a foreground service keeps the app process (and its encoder) alive in the
 *   background, so the peer connection runs in-process. We capture with {@link useScreenShare}
 *   and publish with {@link useLivestreamStreamer}; status is derived from that connection.
 *
 * @remarks
 * On **Android** you MUST run a foreground service with screen sharing enabled
 * (`useForegroundService({ enableScreenSharing: true })`) and set
 * `android.enableForegroundService` / `android.enableScreensharing` in the config plugin.
 * Without it, screen capture delivers no frames — the connection looks established but the
 * viewer receives nothing.
 */
export function useLivestreamScreenShare(): UseLivestreamScreenShareResult {
  const isIOS = Platform.OS === 'ios';

  const fishjamId = useFishjamId();

  // iOS: background broadcast extension + cross-process status channel.
  const iosStatus = useLivestreamStatus();

  // Android: in-app screen capture + WHIP publish (kept alive by the foreground service).
  const screenShare = useScreenShare();
  const streamer = useLivestreamStreamer();
  const pendingConnect = useRef<StartLivestreamScreenShareConfig | null>(null);
  const [androidStatus, setAndroidStatus] = useState<LivestreamStatus>('idle');

  // Android: startStreaming() resolves before `stream` is set, so connect once it lands.
  useEffect(() => {
    if (isIOS) return;
    const pending = pendingConnect.current;
    if (pending && screenShare.stream) {
      pendingConnect.current = null;
      setAndroidStatus('connecting');
      streamer
        .connect({ inputs: { video: screenShare.stream }, token: pending.token }, pending.urlOverride)
        .catch(() => setAndroidStatus('failed'));
    }
  }, [isIOS, screenShare.stream, streamer]);

  // Android: map the in-app streamer connection onto the shared status union.
  useEffect(() => {
    if (isIOS) return;
    if (streamer.error) {
      setAndroidStatus('failed');
    } else if (streamer.isConnected) {
      setAndroidStatus('streaming');
    } else {
      setAndroidStatus((prev) => (prev === 'streaming' ? 'stopped' : prev));
    }
  }, [isIOS, streamer.isConnected, streamer.error]);

  const startScreenShareLivestream = useCallback(
    async (config: StartLivestreamScreenShareConfig) => {
      if (isIOS) {
        const whipUrl = config.urlOverride ?? buildLivestreamWhipUrl(fishjamId);
        // Persist the credentials where the broadcast extension can read them, then let the
        // user pick the extension. The extension reads the credentials on broadcastStarted.
        await writeLivestreamCredentials({ whipUrl, token: config.token });
        await presentLivestreamBroadcastPicker();
        return;
      }
      // Android: begin capture; the connect happens in the effect above once `stream` is set.
      pendingConnect.current = config;
      setAndroidStatus('starting');
      await screenShare.startStreaming();
    },
    [isIOS, fishjamId, screenShare],
  );

  const stopScreenShareLivestream = useCallback(async () => {
    if (isIOS) {
      // Presenting the picker while a broadcast is active opens the system "Stop" sheet.
      await presentLivestreamBroadcastPicker();
      return;
    }
    pendingConnect.current = null;
    streamer.disconnect();
    await screenShare.stopStreaming();
    setAndroidStatus('stopped');
  }, [isIOS, screenShare, streamer]);

  const status = isIOS ? iosStatus.status : androidStatus;
  const error = isIOS ? iosStatus.error : streamer.error != null ? String(streamer.error) : null;

  return {
    startScreenShareLivestream,
    stopScreenShareLivestream,
    status,
    error,
    isStreaming: status === 'streaming',
  };
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
