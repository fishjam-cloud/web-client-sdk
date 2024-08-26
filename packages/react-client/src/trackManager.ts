import type { FishjamClient, SimulcastConfig, TrackBandwidthLimit } from "@fishjam-cloud/ts-client";
import type { MediaManager, TrackManager, TrackMiddleware } from "./types";
import type { Track } from "./state.types";
import { getRemoteOrLocalTrack } from "./utils/track";
import { useEffect, useState } from "react";

interface TrackManagerConfig<PeerMetadata, TrackMetadata> {
  mediaManager: MediaManager;
  tsClient: FishjamClient<PeerMetadata, TrackMetadata>;
}

export const useTrackManager = <PeerMetadata, TrackMetadata>({
  mediaManager,
  tsClient,
}: TrackManagerConfig<PeerMetadata, TrackMetadata>): TrackManager<TrackMetadata> => {
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [currentTrackMiddleware, setCurrentTrackMiddleware] = useState<TrackMiddleware>(null);

  useEffect(() => {
    const disconnectedHandler = () => {
      setCurrentTrackId(null);
    };

    tsClient.on("disconnected", disconnectedHandler);

    return () => {
      tsClient.off("disconnected", disconnectedHandler);
    };
  }, [tsClient]);

  function getPreviousTrack(): Track<TrackMetadata> {
    if (!currentTrackId) throw Error("There is no current track id");

    const prevTrack = getRemoteOrLocalTrack<PeerMetadata, TrackMetadata>(tsClient, currentTrackId);

    if (!prevTrack) throw Error("There is no previous track");

    return prevTrack;
  }

  async function setTrackMiddleware(middleware: TrackMiddleware): Promise<void> {
    const currentTrack = getCurrentTrack();
    const mediaTrack = mediaManager.getTracks()[0];

    if (!currentTrack || !mediaTrack) return;

    const trackToSet = middleware ? middleware(mediaTrack) : mediaTrack;
    await tsClient.replaceTrack(currentTrack.trackId, trackToSet);

    setCurrentTrackMiddleware(() => middleware);
  }

  function getCurrentTrack(): Track<TrackMetadata> | null {
    return getRemoteOrLocalTrack<PeerMetadata, TrackMetadata>(tsClient, currentTrackId);
  }

  async function initialize(deviceId?: string) {
    mediaManager?.start(deviceId ?? true);
  }

  async function stop() {
    mediaManager?.stop();
  }

  async function startStreaming(
    trackMetadata?: TrackMetadata,
    simulcastConfig?: SimulcastConfig,
    maxBandwidth?: TrackBandwidthLimit,
  ) {
    if (currentTrackId) throw Error("Track already added");

    const media = mediaManager.getMedia();

    if (!media || !media.stream || !media.track) throw Error("Device is unavailable");

    const track = getRemoteOrLocalTrack(tsClient, currentTrackId);

    if (track) return track.trackId;

    // see `getRemoteOrLocalTrackContext()` explanation
    setCurrentTrackId(media.track.id);

    const remoteTrackId = await tsClient.addTrack(media.track, trackMetadata, simulcastConfig, maxBandwidth);

    setCurrentTrackId(remoteTrackId);

    return remoteTrackId;
  }

  async function refreshStreamedTrack() {
    const prevTrack = getPreviousTrack();

    const newTrack = mediaManager.getTracks()[0];
    if (!newTrack) throw Error("New track is empty");

    return tsClient.replaceTrack(prevTrack.trackId, newTrack);
  }

  function stopStreaming() {
    const prevTrack = getPreviousTrack();
    setCurrentTrackId(null);
    return tsClient.removeTrack(prevTrack.trackId);
  }

  function pauseStreaming() {
    const prevTrack = getPreviousTrack();
    return tsClient.replaceTrack(prevTrack.trackId, null);
  }

  function resumeStreaming() {
    const prevTrack = getPreviousTrack();
    const media = mediaManager.getMedia();

    if (!media) throw Error("Device is unavailable");

    return tsClient.replaceTrack(prevTrack.trackId, media.track);
  }

  function disableTrack() {
    return mediaManager.disable();
  }

  function enableTrack() {
    return mediaManager.enable();
  }

  return {
    getCurrentTrack,
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
  };
};
