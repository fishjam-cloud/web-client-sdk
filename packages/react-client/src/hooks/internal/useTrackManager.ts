import { type FishjamClient, type TrackMetadata, TrackTypeError, Variant } from "@fishjam-cloud/ts-client";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const [paused, setPaused] = useState<boolean>(false);

  const { startDevice, stopDevice, enableDevice, disableDevice, deviceTrack, applyMiddleware, currentMiddleware } =
    deviceManager;

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

      try {
        const remoteTrackId = await tsClient.addTrack(track, trackMetadata, simulcastConfig, maxBandwidth);

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
    if (!currentTrackId) return;

    setPaused(isTrackCurrentlyEnabled);

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
      if (!newTrack) throw Error("Device is unavailable");

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
