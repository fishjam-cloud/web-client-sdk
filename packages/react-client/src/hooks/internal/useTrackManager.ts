import { type FishjamClient, type TrackMetadata, Variant } from "@fishjam-cloud/ts-client";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import type { Media, MediaManager, TrackManager } from "../../types/internal";
import type { BandwidthLimits, PeerStatus, StreamConfig, TrackMiddleware } from "../../types/public";
import { getConfigAndBandwidthFromProps, getRemoteOrLocalTrack } from "../../utils/track";
import type { NewDeviceApi } from "./device/useDevices";

interface TrackManagerConfig {
  mediaManager: MediaManager;
  newDeviceApi: NewDeviceApi;
  tsClient: FishjamClient;
  peerStatus: PeerStatus;
  bandwidthLimits: BandwidthLimits;
  streamConfig?: StreamConfig;
  devicesInitializationRef: RefObject<Promise<void> | null>;
}

const TRACK_TYPE_TO_DEVICE = {
  video: "camera",
  audio: "microphone",
} as const;

const getDeviceType = (mediaManager: MediaManager) => TRACK_TYPE_TO_DEVICE[mediaManager.getDeviceType()];

export const useTrackManager = ({
  mediaManager,
  newDeviceApi,
  tsClient,
  peerStatus,
  bandwidthLimits,
  streamConfig,
}: TrackManagerConfig): TrackManager => {
  const currentTrackIdRef = useRef<string | null>(null);
  const [paused, setPaused] = useState<boolean>(false);

  async function setTrackMiddleware(middleware: TrackMiddleware | null): Promise<void> {
    mediaManager.setTrackMiddleware(middleware);
    await refreshStreamedTrack();
  }

  async function selectDevice(deviceId?: string) {
    const newStream = await newDeviceApi.start(deviceId);
    const currentTrackId = currentTrackIdRef.current;
    if (!currentTrackId) return;

    const newTrack = newStream?.getTracks()[0] ?? null;
    await tsClient.replaceTrack(currentTrackId, newTrack);
  }

  const getCurrentTrackId = useCallback(
    () => getRemoteOrLocalTrack(tsClient, currentTrackIdRef.current)?.trackId,
    [tsClient],
  );

  const startStreaming = useCallback(
    async (
      stream: MediaStream,
      props: StreamConfig = { simulcast: [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH] },
    ) => {
      const currentTrackId = currentTrackIdRef.current;
      if (currentTrackId) throw Error("Track already added");

      const deviceTrack = stream?.getTracks()[0];

      if (!deviceTrack) throw Error("Device is unavailable");

      const track = getRemoteOrLocalTrack(tsClient, currentTrackId);

      if (track) return track.trackId;

      // see `getRemoteOrLocalTrackContext()` explanation
      currentTrackIdRef.current = deviceTrack.id;

      const deviceType = stream.getVideoTracks().length ? "camera" : "microphone";
      const trackMetadata: TrackMetadata = { type: deviceType, paused: false };

      const displayName = tsClient.getLocalPeer()?.metadata?.peer?.displayName;

      if (typeof displayName === "string") {
        trackMetadata.displayName = displayName;
      }

      const [maxBandwidth, simulcastConfig] = getConfigAndBandwidthFromProps(props.simulcast, bandwidthLimits);

      const remoteTrackId = await tsClient.addTrack(deviceTrack, trackMetadata, simulcastConfig, maxBandwidth);

      currentTrackIdRef.current = remoteTrackId;
      setPaused(false);

      return remoteTrackId;
    },
    [tsClient, bandwidthLimits],
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

  /**
   * @see {@link TrackManager#toggleMute} for more details.
   */
  const toggleMute = useCallback(async () => {
    const track = newDeviceApi.stream?.getTracks()[0];
    const enabled = Boolean(track?.enabled);
    const currentTrackId = currentTrackIdRef.current;
    if (!currentTrackId) return;

    if (enabled) {
      newDeviceApi.disable();
      await tsClient.replaceTrack(currentTrackId, null);
    } else if (track) {
      newDeviceApi.enable();
      await tsClient.replaceTrack(currentTrackId, track);
    }
  }, [newDeviceApi.disable, newDeviceApi.stream, newDeviceApi.enable, tsClient]);

  /**
   * @see {@link TrackManager#toggleDevice} for more details.
   */
  const toggleDevice = useCallback(async () => {
    const track = newDeviceApi.stream?.getTracks()[0];
    const currentTrackId = currentTrackIdRef.current;
    if (!currentTrackId) return;

    if (track) {
      newDeviceApi.stop();
    } else {
      newDeviceApi.start();
    }
  }, [newDeviceApi.disable, newDeviceApi.stream, newDeviceApi.enable, tsClient]);

  useEffect(() => {
    const onJoinedRoom = () => {
      if (newDeviceApi.stream) {
        startStreaming(newDeviceApi.stream, streamConfig);
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
  }, [newDeviceApi.stream, startStreaming, tsClient, streamConfig]);

  return {
    paused,
    setTrackMiddleware,
    selectDevice,
    toggleMute,
    toggleDevice,
  };
};
