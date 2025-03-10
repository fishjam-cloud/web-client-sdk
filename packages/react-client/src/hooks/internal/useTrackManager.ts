import { type FishjamClient, type TrackMetadata, Variant } from "@fishjam-cloud/ts-client";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import type { MediaManager, TrackManager } from "../../types/internal";
import type { BandwidthLimits, PeerStatus, StreamConfig, TrackMiddleware } from "../../types/public";
import { getConfigAndBandwidthFromProps, getRemoteOrLocalTrack } from "../../utils/track";
import type { NewDeviceApi } from "./device/useDevice";

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

  const { startDevice, stopDevice, enableDevice, disableDevice, deviceTrack, applyMiddleware } = newDeviceApi;

  async function selectDevice(deviceId?: string) {
    const newTrack = await newDeviceApi.startDevice(deviceId);
    const currentTrackId = currentTrackIdRef.current;
    if (!currentTrackId) return;

    await tsClient.replaceTrack(currentTrackId, newTrack);
  }

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

      // see `getRemoteOrLocalTrackContext()` explanation
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
    [tsClient, bandwidthLimits, type],
  );

  const pauseStreaming = useCallback(
    async (trackId: string) => {
      disableDevice();
      setPaused(true);
      await tsClient.replaceTrack(trackId, null);
      return tsClient.updateTrackMetadata(trackId, { type, paused: true } satisfies TrackMetadata);
    },
    [disableDevice, tsClient, type],
  );

  const resumeStreaming = useCallback(
    async (trackId: string, track: MediaStreamTrack) => {
      enableDevice();
      setPaused(false);
      await tsClient.replaceTrack(trackId, track);
      return tsClient.updateTrackMetadata(trackId, { type, paused: false } satisfies TrackMetadata);
    },
    [tsClient, type, enableDevice],
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
    const currentTrackId = getCurrentTrackId();

    if (deviceTrack) {
      stopDevice();
    } else {
      const newTrack = await startDevice();
      if (!newTrack) throw Error("Device is unavailable");

      if (currentTrackId) {
        resumeStreaming(currentTrackId, newTrack);
      } else {
        startStreaming(newTrack, streamConfig);
      }
    }
  }, [getCurrentTrackId, deviceTrack, startDevice, stopDevice, resumeStreaming, startStreaming, streamConfig]);

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
    setTrackMiddleware,
    selectDevice,
    toggleMute,
    toggleDevice,
  };
};
