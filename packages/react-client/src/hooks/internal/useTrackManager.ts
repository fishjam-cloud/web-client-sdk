import type { FishjamClient, TrackMetadata } from "@fishjam-cloud/ts-client";
import type { MediaManager, TrackManager } from "../../types/internal";
import { getConfigAndBandwidthFromProps, getRemoteOrLocalTrack } from "../../utils/track";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BandwidthLimits, PeerStatus, StartStreamingProps, TrackMiddleware } from "../../types/public";

interface TrackManagerConfig {
  mediaManager: MediaManager;
  tsClient: FishjamClient;
  getCurrentPeerStatus: () => PeerStatus;
  bandwidthLimits: BandwidthLimits;
  autoStreamProps?: StartStreamingProps | false;
}

type ToggleMode = "hard" | "soft";

const TRACK_TYPE_TO_DEVICE = {
  video: "camera",
  audio: "microphone",
} as const;

const getDeviceType = (mediaManager: MediaManager) => TRACK_TYPE_TO_DEVICE[mediaManager.getDeviceType()];

export const useTrackManager = ({
  mediaManager,
  tsClient,
  getCurrentPeerStatus,
  bandwidthLimits,
  autoStreamProps,
}: TrackManagerConfig): TrackManager => {
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [paused, setPaused] = useState<boolean>(false);

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

  const stop = useCallback(() => mediaManager.stop(), [mediaManager]);

  const startStreaming = useCallback(
    async (props: StartStreamingProps = { simulcast: ["l", "m", "h"] }) => {
      if (currentTrackId) throw Error("Track already added");

      const media = mediaManager.getMedia();

      if (!media || !media.stream || !media.track) throw Error("Device is unavailable");

      const track = getRemoteOrLocalTrack(tsClient, currentTrackId);

      if (track) return track.trackId;

      // see `getRemoteOrLocalTrackContext()` explanation
      setCurrentTrackId(media.track.id);

      const deviceType = getDeviceType(mediaManager);
      const trackMetadata: TrackMetadata = { type: deviceType, paused: false };

      const displayName = tsClient.getLocalPeer()?.metadata?.peer?.displayName;

      if (typeof displayName === "string") {
        trackMetadata.displayName = displayName;
      }

      const [maxBandwidth, simulcastConfig] = getConfigAndBandwidthFromProps(props.simulcast, bandwidthLimits);

      const remoteTrackId = await tsClient.addTrack(media.track, trackMetadata, simulcastConfig, maxBandwidth);

      setCurrentTrackId(remoteTrackId);
      setPaused(false);

      return remoteTrackId;
    },
    [currentTrackId, mediaManager, tsClient, bandwidthLimits],
  );

  const refreshStreamedTrack = useCallback(async () => {
    if (!currentTrack) return;

    const newTrack = mediaManager.getMedia()?.track ?? null;
    if (!newTrack) throw Error("New track is empty");
    return tsClient.replaceTrack(currentTrack.trackId, newTrack);
  }, [currentTrack, mediaManager, tsClient]);

  const stopStreaming = useCallback(async () => {
    if (!currentTrack) return;
    setCurrentTrackId(null);
    setPaused(true);
    return tsClient.removeTrack(currentTrack.trackId);
  }, [currentTrack, tsClient]);

  const pauseStreaming = useCallback(async () => {
    if (!currentTrack) return;

    setPaused(true);
    await tsClient.replaceTrack(currentTrack.trackId, null);
    const deviceType = getDeviceType(mediaManager);
    const trackMetadata: TrackMetadata = { type: deviceType, paused: true };

    return tsClient.updateTrackMetadata(currentTrack.trackId, trackMetadata);
  }, [currentTrack, mediaManager, tsClient]);

  const resumeStreaming = useCallback(async () => {
    if (!currentTrack) return;

    const media = mediaManager.getMedia();
    const deviceType = getDeviceType(mediaManager);

    if (!media) throw Error("Device is unavailable");
    setPaused(false);
    await tsClient.replaceTrack(currentTrack.trackId, media.track);

    const trackMetadata: TrackMetadata = { type: deviceType, paused: false };

    return tsClient.updateTrackMetadata(currentTrack.trackId, trackMetadata);
  }, [currentTrack, mediaManager, tsClient]);

  const disableTrack = useCallback(() => {
    mediaManager.disable();
  }, [mediaManager]);

  const enableTrack = useCallback(() => {
    mediaManager.enable();
  }, [mediaManager]);

  const stream = useCallback(async () => {
    if (getCurrentPeerStatus() !== "connected") return;

    if (currentTrack?.trackId) {
      await resumeStreaming();
    } else {
      await startStreaming();
    }
  }, [currentTrack?.trackId, getCurrentPeerStatus, resumeStreaming, startStreaming]);

  const toggle = useCallback(
    async (mode: ToggleMode) => {
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
    },
    [currentTrack, mediaManager, pauseStreaming, stream],
  );

  /**
   * @see {@link TrackManager#toggleMute} for more details.
   */

  const toggleMute = useCallback(() => toggle("soft"), [toggle]);

  /**
   * @see {@link TrackManager#toggleDevice} for more details.
   */
  const toggleDevice = useCallback(() => toggle("hard"), [toggle]);

  useEffect(() => {
    if (autoStreamProps === false) return;

    const joinedHandler = () => {
      if (mediaManager.getMedia()?.track) {
        startStreaming(autoStreamProps);
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
  }, [mediaManager, startStreaming, tsClient, autoStreamProps]);

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
