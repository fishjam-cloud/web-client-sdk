import type { FishjamClient, SimulcastConfig, TrackBandwidthLimit } from "@fishjam-cloud/ts-client";
import type { MediaManager, PeerMetadata, TrackManager, TrackMetadata, TrackMiddleware } from "../types";
import { getRemoteOrLocalTrack } from "../utils/track";
import { useEffect, useMemo, useRef, useState } from "react";

interface TrackManagerConfig {
  mediaManager: MediaManager;
  tsClient: FishjamClient<PeerMetadata, TrackMetadata>;
}

const TRACK_TYPE_TO_DEVICE = {
  video: "camera",
  audio: "microphone",
} as const;

export const useTrackManager = ({ mediaManager, tsClient }: TrackManagerConfig): TrackManager => {
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [paused, setPaused] = useState<boolean>(false);
  const clearMiddlewareFnRef = useRef<(() => void) | null>(null);

  const [currentTrackMiddleware, setCurrentTrackMiddleware] = useState<TrackMiddleware>(null);
  const type = TRACK_TYPE_TO_DEVICE[mediaManager.getDeviceType()];

  const metadata: TrackMetadata = { type, paused };

  useEffect(() => {
    const disconnectedHandler = () => {
      setCurrentTrackId(null);
    };
    tsClient.on("disconnected", disconnectedHandler);
    return () => {
      tsClient.off("disconnected", disconnectedHandler);
    };
  }, [tsClient]);

  const currentTrack = useMemo(() => getRemoteOrLocalTrack(tsClient, currentTrackId), [tsClient, currentTrackId]);

  function clearMiddleware() {
    clearMiddlewareFnRef.current?.();
    clearMiddlewareFnRef.current = null;
  }

  function getProcessedTrack(inputTrack: MediaStreamTrack, middleware = currentTrackMiddleware): MediaStreamTrack {
    clearMiddleware();
    const { onClear, track = null } = middleware?.(inputTrack) ?? {};
    if (onClear) clearMiddlewareFnRef.current = onClear;
    return track ?? inputTrack;
  }

  async function setTrackMiddleware(middleware: TrackMiddleware): Promise<void> {
    const mediaTrack = mediaManager.getTracks()[0];
    setCurrentTrackMiddleware(() => middleware);
    if (!currentTrack || !mediaTrack) return;

    await tsClient.replaceTrack(currentTrack.trackId, getProcessedTrack(mediaTrack, middleware));
  }

  async function initialize(deviceId?: string) {
    await mediaManager?.start(deviceId ?? true);
    if (!currentTrackId) return;
    const newTrack = mediaManager.getTracks()[0];
    await tsClient.replaceTrack(currentTrackId, getProcessedTrack(newTrack));
  }

  function stop() {
    clearMiddleware();
    return mediaManager?.stop();
  }

  async function startStreaming(simulcastConfig?: SimulcastConfig, maxBandwidth?: TrackBandwidthLimit) {
    if (currentTrackId) throw Error("Track already added");

    const media = mediaManager.getMedia();

    if (!media || !media.stream || !media.track) throw Error("Device is unavailable");

    const track = getRemoteOrLocalTrack(tsClient, currentTrackId);

    if (track) return track.trackId;

    // see `getRemoteOrLocalTrackContext()` explanation
    setCurrentTrackId(media.track.id);

    const displayName = tsClient.getLocalPeer()?.metadata?.displayName;

    const trackMetadata: TrackMetadata = { ...metadata, displayName, paused: false };

    const processedTrack = getProcessedTrack(media.track);

    const remoteTrackId = await tsClient.addTrack(processedTrack, trackMetadata, simulcastConfig, maxBandwidth);

    setCurrentTrackId(remoteTrackId);
    setPaused(false);

    return remoteTrackId;
  }

  async function refreshStreamedTrack() {
    if (!currentTrack) return;

    const newTrack = mediaManager.getTracks()[0];
    if (!newTrack) throw Error("New track is empty");
    return tsClient.replaceTrack(currentTrack.trackId, getProcessedTrack(newTrack));
  }

  async function stopStreaming() {
    if (!currentTrack) return;
    clearMiddleware();
    setCurrentTrackId(null);
    setPaused(true);
    return tsClient.removeTrack(currentTrack.trackId);
  }

  async function pauseStreaming() {
    if (!currentTrack) return;

    setPaused(true);
    await tsClient.replaceTrack(currentTrack.trackId, null);

    const trackMetadata: TrackMetadata = { ...metadata, paused: true };

    return tsClient.updateTrackMetadata(currentTrack.trackId, trackMetadata);
  }

  async function resumeStreaming() {
    if (!currentTrack) return;

    const media = mediaManager.getMedia();

    if (!media) throw Error("Device is unavailable");
    const processedTrack = media.track ? getProcessedTrack(media.track) : null;
    setPaused(false);
    await tsClient.replaceTrack(currentTrack.trackId, processedTrack);

    const trackMetadata: TrackMetadata = { ...metadata, paused: false };

    return tsClient.updateTrackMetadata(currentTrack.trackId, trackMetadata);
  }

  function disableTrack() {
    mediaManager.disable();
  }

  function enableTrack() {
    mediaManager.enable();
  }

  return {
    currentTrack,
    setTrackMiddleware,
    initialize,
    stop,
    startStreaming,
    stopStreaming,
    pauseStreaming,
    resumeStreaming,
    disableTrack,
    enableTrack,
    currentTrackMiddleware,
    refreshStreamedTrack,
    paused,
  };
};
