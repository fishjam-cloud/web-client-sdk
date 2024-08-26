import type { FishjamClient, SimulcastConfig, TrackBandwidthLimit } from "@fishjam-cloud/ts-client";
import type { MediaManager, PeerMetadata, TrackManager, TrackMetadata, TrackMiddleware } from "./types";
import type { Track } from "./state.types";
import { getRemoteOrLocalTrack } from "./utils/track";
import { useEffect, useState } from "react";

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

  function getPreviousTrack(): Track {
    if (!currentTrackId) throw Error("There is no current track id");

    const prevTrack = getRemoteOrLocalTrack(tsClient, currentTrackId);

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

  function getCurrentTrack(): Track | null {
    return getRemoteOrLocalTrack(tsClient, currentTrackId);
  }

  async function initialize(deviceId?: string) {
    mediaManager?.start(deviceId ?? true);
  }

  async function stop() {
    mediaManager?.stop();
  }

  function getType(): TrackMetadata["type"] {
    return TRACK_TYPE_TO_DEVICE[mediaManager.getDeviceType()];
  }

  async function startStreaming(simulcastConfig?: SimulcastConfig, maxBandwidth?: TrackBandwidthLimit) {
    if (currentTrackId) throw Error("Track already added");

    const media = mediaManager.getMedia();

    if (!media || !media.stream || !media.track) throw Error("Device is unavailable");

    const track = getRemoteOrLocalTrack(tsClient, currentTrackId);

    if (track) return track.trackId;

    // see `getRemoteOrLocalTrackContext()` explanation
    setCurrentTrackId(media.track.id);

    const trackMetadata = { type: getType(), paused: false };

    const remoteTrackId = await tsClient.addTrack(media.track, trackMetadata, simulcastConfig, maxBandwidth);

    setCurrentTrackId(remoteTrackId);
    setPaused(false);

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
    setPaused(true);
    return tsClient.removeTrack(prevTrack.trackId);
  }

  async function pauseStreaming() {
    const prevTrack = getPreviousTrack();
    setPaused(true);
    await tsClient.replaceTrack(prevTrack.trackId, null);

    const trackMetadata = {
      type: getType(),
      paused: true,
    };
    return tsClient.updateTrackMetadata(prevTrack.trackId, trackMetadata);
  }

  async function resumeStreaming() {
    const prevTrack = getPreviousTrack();
    const media = mediaManager.getMedia();

    if (!media) throw Error("Device is unavailable");

    setPaused(false);
    await tsClient.replaceTrack(prevTrack.trackId, media.track);

    const trackMetadata = {
      type: getType(),
      paused: false,
    };
    return tsClient.updateTrackMetadata(prevTrack.trackId, trackMetadata);
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
    paused,
  };
};
