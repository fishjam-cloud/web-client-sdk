import { type FishjamClient, type TrackMetadata, TrackTypeError, Variant } from "@fishjam-cloud/ts-client";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import type { MediaManager, TrackManager } from "../../types/internal";
import type { BandwidthLimits, PeerStatus, StreamConfig, TrackMiddleware } from "../../types/public";
import { getConfigAndBandwidthFromProps, getRemoteOrLocalTrack } from "../../utils/track";

interface TrackManagerConfig {
  mediaManager: MediaManager;
  tsClient: FishjamClient;
  getCurrentPeerStatus: () => PeerStatus;
  bandwidthLimits: BandwidthLimits;
  streamConfig?: StreamConfig;
  devicesInitializationRef: RefObject<Promise<void> | null>;
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
  devicesInitializationRef,
}: TrackManagerConfig): TrackManager => {
  const currentTrackIdRef = useRef<string | null>(null);
  const [paused, setPaused] = useState<boolean>(false);

  async function setTrackMiddleware(middleware: TrackMiddleware | null): Promise<void> {
    mediaManager.setTrackMiddleware(middleware);
    await refreshStreamedTrack();
  }

  async function selectDevice(deviceId?: string) {
    await mediaManager?.start(deviceId);
    const currentTrackId = currentTrackIdRef.current;
    if (!currentTrackId) return;

    const newTrack = mediaManager.getMedia()?.track ?? null;
    await tsClient.replaceTrack(currentTrackId, newTrack);
  }

  const getCurrentTrackId = useCallback(
    () => getRemoteOrLocalTrack(tsClient, currentTrackIdRef.current)?.trackId,
    [tsClient],
  );

  const startStreaming = useCallback(
    async (
      props: StreamConfig = { simulcast: [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH] },
    ) => {
      const currentTrackId = currentTrackIdRef.current;
      if (currentTrackId) throw Error("Track already added");

      const media = mediaManager.getMedia();

      if (!media || !media.stream || !media.track) throw Error("Device is unavailable");

      const track = getRemoteOrLocalTrack(tsClient, currentTrackId);

      if (track) return track.trackId;

      // see `getRemoteOrLocalTrackContext()` explanation
      currentTrackIdRef.current = media.track.id;

      const deviceType = getDeviceType(mediaManager);
      const trackMetadata: TrackMetadata = { type: deviceType, paused: false };

      const displayName = tsClient.getLocalPeer()?.metadata?.peer?.displayName;

      if (typeof displayName === "string") {
        trackMetadata.displayName = displayName;
      }

      const [maxBandwidth, simulcastConfig] = getConfigAndBandwidthFromProps(props.simulcast, bandwidthLimits);

      try {
        const remoteTrackId = await tsClient.addTrack(media.track, trackMetadata, simulcastConfig, maxBandwidth);
        currentTrackIdRef.current = remoteTrackId;
        setPaused(false);

        return remoteTrackId;
      } catch (err) {
        if (err instanceof TrackTypeError) {
          console.warn(err.message);
          currentTrackIdRef.current = null;
          return null;
        }
        throw err;
      }
    },
    [mediaManager, tsClient, bandwidthLimits],
  );

  const refreshStreamedTrack = useCallback(async () => {
    const trackId = getCurrentTrackId();
    if (!trackId) return;

    const newTrack = mediaManager.getMedia()?.track ?? null;
    if (!newTrack) throw Error("New track is empty");
    return tsClient.replaceTrack(trackId, newTrack);
  }, [getCurrentTrackId, mediaManager, tsClient]);

  const pauseStreaming = useCallback(async () => {
    const trackId = getCurrentTrackId();
    if (!trackId) return;

    setPaused(true);
    await tsClient.replaceTrack(trackId, null);
    const deviceType = getDeviceType(mediaManager);
    const trackMetadata: TrackMetadata = { type: deviceType, paused: true };

    return tsClient.updateTrackMetadata(trackId, trackMetadata);
  }, [mediaManager, getCurrentTrackId, tsClient]);

  const resumeStreaming = useCallback(async () => {
    const trackId = getCurrentTrackId();
    if (!trackId) return;

    const media = mediaManager.getMedia();
    const deviceType = getDeviceType(mediaManager);

    if (!media) throw Error("Device is unavailable");
    setPaused(false);
    await tsClient.replaceTrack(trackId, media.track);

    const trackMetadata: TrackMetadata = { type: deviceType, paused: false };

    return tsClient.updateTrackMetadata(trackId, trackMetadata);
  }, [mediaManager, tsClient, getCurrentTrackId]);

  const stream = useCallback(async () => {
    if (getCurrentPeerStatus() !== "connected") return;
    const trackId = getRemoteOrLocalTrack(tsClient, currentTrackIdRef.current)?.trackId;
    if (trackId) {
      await resumeStreaming();
    } else {
      await startStreaming();
    }
  }, [tsClient, getCurrentPeerStatus, resumeStreaming, startStreaming]);

  const toggle = useCallback(
    async (mode: ToggleMode) => {
      await devicesInitializationRef.current;

      const mediaStream = mediaManager.getMedia()?.stream;
      const track = mediaManager.getMedia()?.track ?? null;
      const enabled = Boolean(track?.enabled);
      const trackId = getRemoteOrLocalTrack(tsClient, currentTrackIdRef.current)?.trackId;

      if (mediaStream && enabled) {
        mediaManager.disable();

        if (trackId) {
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
    [devicesInitializationRef, mediaManager, tsClient, pauseStreaming, stream],
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
      setPaused(true);
      currentTrackIdRef.current = null;
    };

    tsClient.on("joined", onJoinedRoom);
    tsClient.on("disconnected", onLeftRoom);
    return () => {
      tsClient.off("joined", onJoinedRoom);
      tsClient.off("disconnected", onLeftRoom);
    };
  }, [mediaManager, startStreaming, tsClient, streamConfig]);

  return {
    paused,
    setTrackMiddleware,
    selectDevice,
    toggleMute,
    toggleDevice,
  };
};
