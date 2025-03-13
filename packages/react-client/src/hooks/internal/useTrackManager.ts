import { type FishjamClient, type TrackMetadata, Variant } from "@fishjam-cloud/ts-client";
import { useCallback, useEffect, useRef, useState } from "react";

import type { TrackManager } from "../../types/internal";
import type { BandwidthLimits, PeerStatus, StreamConfig, TrackMiddleware } from "../../types/public";
import { getConfigAndBandwidthFromProps, getRemoteOrLocalTrack } from "../../utils/track";
import type { DeviceApi } from "./device/useDevice";

interface TrackManagerConfig {
  device: DeviceApi;
  tsClient: FishjamClient;
  peerStatus: PeerStatus;
  bandwidthLimits: BandwidthLimits;
  streamConfig?: StreamConfig;
  type: "camera" | "microphone";
}

export const useTrackManager = ({
  device,
  tsClient,
  peerStatus,
  bandwidthLimits,
  streamConfig,
  type,
}: TrackManagerConfig): TrackManager => {
  const currentTrackIdRef = useRef<string | null>(null);
  const [paused, setPaused] = useState<boolean>(false);

  const { startDevice, stopDevice, enableDevice, disableDevice, deviceTrack, applyMiddleware, currentMiddleware } =
    device;

  const selectDevice = useCallback(
    async (deviceId?: string) => {
      const newTrack = await startDevice(deviceId);
      const currentTrackId = currentTrackIdRef.current;
      if (!currentTrackId) return;

      await tsClient.replaceTrack(currentTrackId, newTrack);
    },
    [startDevice, tsClient],
  );

  const getCurrentTrackId = useCallback(
    () => getRemoteOrLocalTrack(tsClient, currentTrackIdRef.current)?.trackId,
    [tsClient],
  );

  const setTrackMiddleware = useCallback(
    async (middleware: TrackMiddleware) => {
      const processedTrack = applyMiddleware(middleware);

      const currentTrackId = getCurrentTrackId();
      if (!currentTrackId) return;

      await tsClient.replaceTrack(currentTrackId, processedTrack);
    },
    [applyMiddleware, getCurrentTrackId, tsClient],
  );

  const startStreaming = useCallback(
    async (
      track: MediaStreamTrack,
      props: StreamConfig = { simulcast: [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH] },
    ) => {
      const currentTrackId = currentTrackIdRef.current;
      if (currentTrackId) throw Error("Track already added");
      if (!track) throw Error("Device is unavailable");

      const fishjamTrack = getRemoteOrLocalTrack(tsClient, currentTrackId);
      if (fishjamTrack) return fishjamTrack.trackId;

      // see `getRemoteOrLocalTrack()` explanation
      currentTrackIdRef.current = track.id;

      const trackMetadata: TrackMetadata = { type, paused: false };

      const displayName = tsClient.getLocalPeer()?.metadata?.peer?.displayName;

      if (typeof displayName === "string") {
        trackMetadata.displayName = displayName;
      }

      const [maxBandwidth, simulcastConfig] = getConfigAndBandwidthFromProps(props.simulcast, bandwidthLimits);

      const remoteTrackId = await tsClient.addTrack(track, trackMetadata, simulcastConfig, maxBandwidth);

      currentTrackIdRef.current = remoteTrackId;
      setPaused(false);

      return remoteTrackId;
    },
    [tsClient, type, bandwidthLimits],
  );

  const pauseStreaming = useCallback(
    async (trackId: string) => {
      disableDevice();
      setPaused(true);
      if (peerStatus !== "connected") return;
      await tsClient.replaceTrack(trackId, null);
      return tsClient.updateTrackMetadata(trackId, { type, paused: true } satisfies TrackMetadata);
    },
    [disableDevice, tsClient, type, peerStatus],
  );

  const resumeStreaming = useCallback(
    async (trackId: string, track: MediaStreamTrack) => {
      enableDevice();
      setPaused(false);
      if (peerStatus !== "connected") return;
      await tsClient.replaceTrack(trackId, track);
      return tsClient.updateTrackMetadata(trackId, { type, paused: false } satisfies TrackMetadata);
    },
    [enableDevice, peerStatus, tsClient, type],
  );

  /**
   * @see {@link TrackManager#toggleMute} for more details.
   */
  const toggleMute = useCallback(async () => {
    const enabled = Boolean(deviceTrack?.enabled);
    const currentTrackId = getCurrentTrackId();
    if (!currentTrackId) return;

    if (enabled) {
      pauseStreaming(currentTrackId);
    } else if (deviceTrack) {
      resumeStreaming(currentTrackId, deviceTrack);
    }
  }, [getCurrentTrackId, deviceTrack, pauseStreaming, resumeStreaming]);

  /**
   * @see {@link TrackManager#toggleDevice} for more details.
   */
  const toggleDevice = useCallback(async () => {
    if (deviceTrack) {
      stopDevice();
    } else {
      const newTrack = await startDevice();
      if (!newTrack) throw Error("Device is unavailable");

      const currentTrackId = getCurrentTrackId();
      if (currentTrackId) {
        resumeStreaming(currentTrackId, newTrack);
      }
    }
  }, [getCurrentTrackId, deviceTrack, startDevice, stopDevice, resumeStreaming]);

  useEffect(() => {
    const onJoinedRoom = () => {
      if (deviceTrack) {
        startStreaming(deviceTrack, streamConfig);
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
  }, [deviceTrack, startStreaming, tsClient, streamConfig]);

  return {
    paused,
    deviceTrack,
    currentMiddleware,
    setTrackMiddleware,
    selectDevice,
    toggleMute,
    toggleDevice,
  };
};
