import type { FishjamClient, SimulcastConfig, TrackBandwidthLimit } from "@fishjam-cloud/ts-client";
import type { MediaManager, PeerMetadata, TrackManager, TrackMetadata } from "../types/internal";
import { getRemoteOrLocalTrack } from "../utils/track";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PeerStatus, TrackMiddleware } from "../types/public";

interface TrackManagerConfig {
  mediaManager: MediaManager;
  tsClient: FishjamClient<PeerMetadata, TrackMetadata>;
  getCurrentPeerStatus: () => PeerStatus;
}

type ToggleMode = "hard" | "soft";

const TRACK_TYPE_TO_DEVICE = {
  video: "camera",
  audio: "microphone",
} as const;

export const useTrackManager = ({ mediaManager, tsClient, getCurrentPeerStatus }: TrackManagerConfig): TrackManager => {
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [paused, setPaused] = useState<boolean>(false);

  const type = TRACK_TYPE_TO_DEVICE[mediaManager.getDeviceType()];

  const metadata: TrackMetadata = useMemo(() => ({ type, paused }), [type, paused]);

  const currentTrack = useMemo(() => getRemoteOrLocalTrack(tsClient, currentTrackId), [tsClient, currentTrackId]);

  async function setTrackMiddleware(middleware: TrackMiddleware | null): Promise<void> {
    mediaManager.setTrackMiddleware(middleware);
    await refreshStreamedTrack();
  }

  async function initialize(deviceId?: string) {
    await mediaManager?.start(deviceId);
    if (!currentTrackId) return;

    const newTrack = mediaManager.getMedia()?.track ?? null;
    await tsClient.replaceTrack(currentTrackId, newTrack);
  }

  function stop() {
    return mediaManager.stop();
  }

  const startStreaming = useCallback(
    async (simulcastConfig?: SimulcastConfig, maxBandwidth?: TrackBandwidthLimit) => {
      if (currentTrackId) throw Error("Track already added");

      const media = mediaManager.getMedia();

      if (!media || !media.stream || !media.track) throw Error("Device is unavailable");

      const track = getRemoteOrLocalTrack(tsClient, currentTrackId);

      if (track) return track.trackId;

      // see `getRemoteOrLocalTrackContext()` explanation
      setCurrentTrackId(media.track.id);

      const displayName = tsClient.getLocalPeer()?.metadata?.peer?.displayName;

      const trackMetadata: TrackMetadata = { ...metadata, displayName, paused: false };

      const remoteTrackId = await tsClient.addTrack(media.track, trackMetadata, simulcastConfig, maxBandwidth);

      setCurrentTrackId(remoteTrackId);
      setPaused(false);

      return remoteTrackId;
    },
    [currentTrackId, mediaManager, metadata, tsClient],
  );

  async function refreshStreamedTrack() {
    if (!currentTrack) return;

    const newTrack = mediaManager.getMedia()?.track ?? null;
    if (!newTrack) throw Error("New track is empty");
    return tsClient.replaceTrack(currentTrack.trackId, newTrack);
  }

  async function stopStreaming() {
    if (!currentTrack) return;
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
    setPaused(false);
    await tsClient.replaceTrack(currentTrack.trackId, media.track);

    const trackMetadata: TrackMetadata = { ...metadata, paused: false };

    return tsClient.updateTrackMetadata(currentTrack.trackId, trackMetadata);
  }

  function disableTrack() {
    mediaManager.disable();
  }

  function enableTrack() {
    mediaManager.enable();
  }

  const stream = async () => {
    if (getCurrentPeerStatus() !== "connected") return;

    if (currentTrack?.trackId) {
      await resumeStreaming();
    } else {
      await startStreaming();
    }
  };

  async function toggle(mode: ToggleMode) {
    const mediaStream = mediaManager.getMedia()?.stream;
    const track = mediaManager.getMedia()?.track ?? null;
    const enabled = Boolean(track?.enabled);

    if (mediaStream && enabled) {
      mediaManager.disable();
      if (currentTrack?.trackId) {
        await pauseStreaming();
      }

      if (mode === "hard") {
        mediaManager.stop();
      }
    } else if (mediaStream && !enabled) {
      mediaManager.enable();
      await stream();
    } else {
      await mediaManager.start();
      await stream();
    }
  }

  /**
   * @see {@link TrackManager#toggleMute} for more details.
   */
  async function toggleMute() {
    await toggle("soft");
  }

  /**
   * @see {@link TrackManager#toggleDevice} for more details.
   */
  async function toggleDevice() {
    await toggle("hard");
  }

  useEffect(() => {
    const joinedHandler = () => {
      if (mediaManager.getMedia()?.track) {
        startStreaming();
      }
    };

    const disconnectedHandler = () => {
      setCurrentTrackId(null);
    };

    tsClient.on("joined", joinedHandler);
    tsClient.on("disconnected", disconnectedHandler);
    return () => {
      tsClient.off("joined", joinedHandler);
      tsClient.off("disconnected", disconnectedHandler);
    };
  }, [mediaManager, startStreaming, tsClient]);

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
    refreshStreamedTrack,
    paused,
    toggleMute,
    toggleDevice,
  };
};
