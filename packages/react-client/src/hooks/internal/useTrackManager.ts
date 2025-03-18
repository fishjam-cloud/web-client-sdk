import { type FishjamClient, type TrackMetadata, TrackTypeError, Variant } from "@fishjam-cloud/ts-client";
import { useCallback, useEffect, useRef } from "react";

import type { TrackManager } from "../../types/internal";
import type { BandwidthLimits, PeerStatus, StreamConfig, TrackMiddleware } from "../../types/public";
import { getConfigAndBandwidthFromProps, getRemoteOrLocalTrack } from "../../utils/track";
import type { DeviceManager } from "./devices/useDeviceManager";

interface TrackManagerConfig {
  deviceManager: DeviceManager;
  tsClient: FishjamClient;
  peerStatus: PeerStatus;
  bandwidthLimits: BandwidthLimits;
  streamConfig?: StreamConfig;
  type: "camera" | "microphone";
}

export const useTrackManager = ({
  deviceManager,
  tsClient,
  peerStatus,
  bandwidthLimits,
  streamConfig,
  type,
}: TrackManagerConfig): TrackManager => {
  const currentTrackIdRef = useRef<string | null>(null);

  const { startDevice, stopDevice, enableDevice, disableDevice, deviceTrack, applyMiddleware, currentMiddleware } =
    deviceManager;

  const getCurrentTrackId = useCallback(() => {
    const refTrackId = currentTrackIdRef.current;
    if (!refTrackId) return null;
    const currentTrack = getRemoteOrLocalTrack(tsClient, refTrackId);
    return currentTrack?.trackId ?? null;
  }, [tsClient]);

  const selectDevice = useCallback(
    async (deviceId?: string) => {
      const newTrack = await startDevice(deviceId);
      const currentTrackId = getCurrentTrackId();
      if (!currentTrackId) return;

      await tsClient.replaceTrack(currentTrackId, newTrack);
    },
    [getCurrentTrackId, startDevice, tsClient],
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
      // temporarily setting the local trackId until we have the remoteTrackId
      currentTrackIdRef.current = track.id;

      const trackMetadata: TrackMetadata = { type, paused: false };

      const displayName = tsClient.getLocalPeer()?.metadata?.peer?.displayName;
      if (typeof displayName === "string") {
        trackMetadata.displayName = displayName;
      }

      const [maxBandwidth, simulcastConfig] = getConfigAndBandwidthFromProps(props.simulcast, bandwidthLimits);

      try {
        const remoteTrackId = await tsClient.addTrack(track, trackMetadata, simulcastConfig, maxBandwidth);

        currentTrackIdRef.current = remoteTrackId;
      } catch (err) {
        if (err instanceof TrackTypeError) {
          console.warn(err.message);
          currentTrackIdRef.current = null;
        }
        throw err;
      }
    },
    [tsClient, type, bandwidthLimits],
  );

  const pauseStreaming = useCallback(
    async (trackId: string) => {
      if (peerStatus !== "connected") return;
      await tsClient.replaceTrack(trackId, null);
      return tsClient.updateTrackMetadata(trackId, { type, paused: true } satisfies TrackMetadata);
    },
    [tsClient, type, peerStatus],
  );

  const resumeStreaming = useCallback(
    async (trackId: string, track: MediaStreamTrack) => {
      if (peerStatus !== "connected") return;
      await tsClient.replaceTrack(trackId, track);
      return tsClient.updateTrackMetadata(trackId, { type, paused: false } satisfies TrackMetadata);
    },
    [peerStatus, tsClient, type],
  );

  /**
   * @see {@link TrackManager#toggleMute} for more details.
   */
  const toggleMute = useCallback(async () => {
    const isTrackCurrentlyEnabled = Boolean(deviceTrack?.enabled);
    const currentTrackId = getCurrentTrackId();
    if (!currentTrackId) {
      console.warn("Toggling mute is only possible while connected to a room.");
      return;
    }

    if (isTrackCurrentlyEnabled) {
      disableDevice();
      await pauseStreaming(currentTrackId);
    } else if (deviceTrack) {
      enableDevice();
      await resumeStreaming(currentTrackId, deviceTrack);
    }
  }, [deviceTrack, getCurrentTrackId, disableDevice, pauseStreaming, enableDevice, resumeStreaming]);

  /**
   * @see {@link TrackManager#toggleDevice} for more details.
   */
  const toggleDevice = useCallback(async () => {
    const currentTrackId = getCurrentTrackId();
    if (deviceTrack) {
      stopDevice();
      if (currentTrackId) {
        pauseStreaming(currentTrackId);
      }
    } else {
      const newTrack = await startDevice();
      if (!newTrack) {
        console.warn(`Failed to start ${type} device.`);
        return;
      }

      if (currentTrackId) {
        await resumeStreaming(currentTrackId, newTrack);
      } else if (peerStatus === "connected") {
        await startStreaming(newTrack, streamConfig);
      }
    }
  }, [
    getCurrentTrackId,
    deviceTrack,
    stopDevice,
    pauseStreaming,
    startDevice,
    peerStatus,
    type,
    resumeStreaming,
    startStreaming,
    streamConfig,
  ]);

  useEffect(() => {
    const onJoinedRoom = () => {
      if (deviceTrack) {
        startStreaming(deviceTrack, streamConfig);
      }
    };

    const onLeftRoom = () => {
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
    deviceTrack,
    currentMiddleware,
    setTrackMiddleware,
    selectDevice,
    toggleMute,
    toggleDevice,
  };
};
