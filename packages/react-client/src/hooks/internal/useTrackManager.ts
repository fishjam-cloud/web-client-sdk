import { type FishjamClient, type TrackMetadata, Variant } from "@fishjam-cloud/ts-client";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { MediaManager, TrackManager } from "../../types/internal";
import type { BandwidthLimits, PeerStatus, StreamConfig, TrackMiddleware } from "../../types/public";
import { getConfigAndBandwidthFromProps, getRemoteOrLocalTrack } from "../../utils/track";

interface TrackManagerConfig {
  mediaManager: MediaManager;
  tsClient: FishjamClient;
  getCurrentPeerStatus: () => PeerStatus;
  bandwidthLimits: BandwidthLimits;
  streamConfig?: StreamConfig;
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
  streamConfig,
}: TrackManagerConfig): TrackManager => {
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [paused, setPaused] = useState<boolean>(false);

  const currentTrack = useMemo(() => getRemoteOrLocalTrack(tsClient, currentTrackId), [tsClient, currentTrackId]);

  async function setTrackMiddleware(middleware: TrackMiddleware | null): Promise<void> {
    mediaManager.setTrackMiddleware(middleware);
    await refreshStreamedTrack();
  }

  async function selectDevice(deviceId?: string) {
    await mediaManager?.start(deviceId);
    if (!currentTrackId) return;

    const newTrack = mediaManager.getMedia()?.track ?? null;
    await tsClient.replaceTrack(currentTrackId, newTrack);
  }

  const startStreaming = useCallback(
    async (
      props: StreamConfig = { simulcast: [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH] },
    ) => {
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
    const onJoinedRoom = () => {
      if (mediaManager.getMedia()?.track) {
        startStreaming(streamConfig);
      }
    };

    const onLeftRoom = () => {
      if (currentTrackId) {
        tsClient.removeTrack(currentTrackId);
      }
      setPaused(true);
      setCurrentTrackId(null);
    };

    tsClient.on("joined", onJoinedRoom);
    tsClient.on("disconnected", onLeftRoom);
    return () => {
      tsClient.off("joined", onJoinedRoom);
      tsClient.off("disconnected", onLeftRoom);
    };
  }, [mediaManager, startStreaming, tsClient, streamConfig, currentTrackId]);

  return {
    currentTrack,
    setTrackMiddleware,
    paused,
    selectDevice,
    toggleMute,
    toggleDevice,
  };
};
