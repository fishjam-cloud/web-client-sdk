import { type FishjamClient, type TrackMetadata, Variant } from "@fishjam-cloud/ts-client";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MediaManager, TrackManager } from "../../types/internal";
import type { BandwidthLimits, PeerStatus, StreamConfig, TrackMiddleware } from "../../types/public";
import { getConfigAndBandwidthFromProps, getRemoteOrLocalTrack } from "../../utils/track";
import type { NewDeviceApi } from "./device/useDevices";
import { useTrackMiddleware } from "./useTrackMiddleware";

interface TrackManagerConfig {
  mediaManager: MediaManager;
  newDeviceApi: NewDeviceApi;
  tsClient: FishjamClient;
  peerStatus: PeerStatus;
  bandwidthLimits: BandwidthLimits;
  streamConfig?: StreamConfig;
  devicesInitializationRef: RefObject<Promise<void> | null>;
  type: "camera" | "microphone";
}

export const useTrackManager = ({
  newDeviceApi,
  tsClient,
  bandwidthLimits,
  streamConfig,
  type,
}: TrackManagerConfig): TrackManager => {
  const currentTrackIdRef = useRef<string | null>(null);
  const [paused, setPaused] = useState<boolean>(false);

  async function setTrackMiddleware(middleware: TrackMiddleware | null): Promise<void> {
    const trackId = getCurrentTrackId();
    if (!trackId) return;

    return tsClient.replaceTrack(trackId, newDeviceApi.track);
  }

  async function selectDevice(deviceId?: string) {
    const newTrack = await newDeviceApi.start(deviceId);
    const currentTrackId = currentTrackIdRef.current;
    if (!currentTrackId) return;

    await tsClient.replaceTrack(currentTrackId, newTrack);
  }

  const getCurrentTrackId = useCallback(
    () => getRemoteOrLocalTrack(tsClient, currentTrackIdRef.current)?.trackId,
    [tsClient],
  );

  const startStreaming = useCallback(
    async (
      deviceTrack: MediaStreamTrack,
      props: StreamConfig = { simulcast: [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH] },
    ) => {
      const currentTrackId = currentTrackIdRef.current;
      if (currentTrackId) throw Error("Track already added");
      if (!deviceTrack) throw Error("Device is unavailable");

      const track = getRemoteOrLocalTrack(tsClient, currentTrackId);

      if (track) return track.trackId;

      // see `getRemoteOrLocalTrackContext()` explanation
      currentTrackIdRef.current = deviceTrack.id;

      const trackMetadata: TrackMetadata = { type, paused: false };

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
    [tsClient, bandwidthLimits, type],
  );

  const pauseStreaming = useCallback(
    async (trackId: string) => {
      newDeviceApi.disable();
      setPaused(true);
      await tsClient.replaceTrack(trackId, null);
      return tsClient.updateTrackMetadata(trackId, { type, paused: true } satisfies TrackMetadata);
    },
    [newDeviceApi.disable, tsClient, type],
  );

  const resumeStreaming = useCallback(
    async (trackId: string, track: MediaStreamTrack) => {
      newDeviceApi.enable();
      setPaused(false);
      await tsClient.replaceTrack(trackId, track);
      return tsClient.updateTrackMetadata(trackId, { type, paused: false } satisfies TrackMetadata);
    },
    [tsClient, type, newDeviceApi.enable],
  );

  /**
   * @see {@link TrackManager#toggleMute} for more details.
   */
  const toggleMute = useCallback(async () => {
    const enabled = Boolean(newDeviceApi.track?.enabled);
    const currentTrackId = currentTrackIdRef.current;
    if (!currentTrackId) return;

    if (enabled) {
      pauseStreaming(currentTrackId);
    } else if (newDeviceApi.track) {
      resumeStreaming(currentTrackId, newDeviceApi.track);
    }
  }, [newDeviceApi.track, pauseStreaming, resumeStreaming]);

  /**
   * @see {@link TrackManager#toggleDevice} for more details.
   */
  const toggleDevice = useCallback(async () => {
    const currentTrackId = currentTrackIdRef.current;

    if (newDeviceApi.track) {
      newDeviceApi.stop();
    } else {
      const newTrack = await newDeviceApi.start();
      if (!newTrack) throw Error("Device is unavailable");

      if (currentTrackId) {
        resumeStreaming(currentTrackId, newTrack);
      } else {
        startStreaming(newTrack, streamConfig);
      }
    }
  }, [newDeviceApi, startStreaming, streamConfig, resumeStreaming]);

  useEffect(() => {
    const onJoinedRoom = () => {
      if (newDeviceApi.track) {
        startStreaming(newDeviceApi.track, streamConfig);
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
  }, [newDeviceApi.track, startStreaming, tsClient, streamConfig]);

  return {
    paused,
    setTrackMiddleware,
    selectDevice,
    toggleMute,
    toggleDevice,
  };
};
