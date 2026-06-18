import { type FishjamClient, type Logger, type TrackMetadata, TrackTypeError, Variant } from "@fishjam-cloud/ts-client";
import { useEffect, useRef } from "react";

import type { TrackManager } from "../../types/internal";
import type { BandwidthLimits, PeerStatus, StreamConfig, TrackMiddleware } from "../../types/public";
import { getConfigAndBandwidthFromProps, getRemoteOrLocalTrack } from "../../utils/track";
import type { DeviceManager } from "./devices/useDeviceManager";
import { useCurrentCallback } from "./useCurrentCallback";

interface TrackManagerConfig {
  deviceManager: DeviceManager;
  tsClient: FishjamClient;
  peerStatus: PeerStatus;
  bandwidthLimits: BandwidthLimits;
  streamConfig?: StreamConfig;
  type: "camera" | "microphone";
  logger: Logger;
}

export const useTrackManager = ({
  deviceManager,
  tsClient,
  peerStatus,
  bandwidthLimits,
  streamConfig,
  type,
  logger,
}: TrackManagerConfig): TrackManager => {
  const currentTrackIdRef = useRef<string | null>(null);
  const connectionPromiseRef = useRef<Promise<string> | null>(null);

  const {
    startDevice,
    stopDevice,
    enableDevice,
    disableDevice,
    deviceTrack,
    applyMiddleware,
    currentMiddleware,
    selectDevice: _selectDevice,
  } = deviceManager;

  // Read live deviceTrack from the `joined` listener without re-subscribing
  // every time it changes.
  const getDeviceTrack = useCurrentCallback(() => deviceTrack);

  const getCurrentTrackId = async (): Promise<string | null> => {
    if (connectionPromiseRef.current) {
      await connectionPromiseRef.current;
    }
    const refTrackId = currentTrackIdRef.current;
    if (!refTrackId) return null;
    const currentTrack = getRemoteOrLocalTrack(tsClient, refTrackId);
    return currentTrack?.trackId ?? null;
  };

  const selectDevice = useCurrentCallback(async (deviceId: string) => {
    const result = await _selectDevice(deviceId);
    if (!result) return;

    const [newTrack, error] = result;
    if (error) return error;

    const currentTrackId = await getCurrentTrackId();
    if (!currentTrackId) return;

    await tsClient.replaceTrack(currentTrackId, newTrack);
  });

  const setTrackMiddleware = useCurrentCallback(async (middleware: TrackMiddleware) => {
    const processedTrack = await applyMiddleware(middleware);

    const currentTrackId = await getCurrentTrackId();
    if (!currentTrackId) return;

    await tsClient.replaceTrack(currentTrackId, processedTrack);
  });

  const startStreaming = useCurrentCallback(
    async (
      track: MediaStreamTrack,
      props: StreamConfig = { sentQualities: [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH] },
    ) => {
      // temporarily setting the local trackId until we have the remoteTrackId
      currentTrackIdRef.current = track.id;

      const trackMetadata: TrackMetadata = { type, paused: false };

      const displayName = tsClient.getLocalPeer()?.metadata?.peer?.displayName;
      if (typeof displayName === "string") {
        trackMetadata.displayName = displayName;
      }

      const [maxBandwidth, simulcastConfig] = getConfigAndBandwidthFromProps(props.sentQualities, bandwidthLimits);

      try {
        const addTrackJob = tsClient.addTrack(track, trackMetadata, simulcastConfig, maxBandwidth);
        connectionPromiseRef.current = addTrackJob;
        const remoteTrackId = await addTrackJob;
        currentTrackIdRef.current = remoteTrackId;
      } catch (err) {
        if (err instanceof TrackTypeError) {
          logger.warn(err.message);
          currentTrackIdRef.current = null;
        }
        throw err;
      }
    },
  );

  const pauseStreaming = useCurrentCallback(async (trackId: string) => {
    if (peerStatus !== "connected") return;
    await tsClient.replaceTrack(trackId, null);
    return tsClient.updateTrackMetadata(trackId, { type, paused: true } satisfies TrackMetadata);
  });

  const resumeStreaming = useCurrentCallback(async (trackId: string, track: MediaStreamTrack) => {
    if (peerStatus !== "connected") return;
    await tsClient.replaceTrack(trackId, track);
    return tsClient.updateTrackMetadata(trackId, { type, paused: false } satisfies TrackMetadata);
  });

  /**
   * @see {@link TrackManager#toggleMute} for more details.
   */
  const toggleMute = useCurrentCallback(async () => {
    const currentTrackId = await getCurrentTrackId();
    const isTrackCurrentlyEnabled = Boolean(deviceTrack?.enabled);
    if (!currentTrackId) {
      logger.warn("Toggling mute is only possible while connected to a room.");
      return;
    }

    if (isTrackCurrentlyEnabled) {
      disableDevice();
      await pauseStreaming(currentTrackId);
    } else if (deviceTrack) {
      enableDevice();
      await resumeStreaming(currentTrackId, deviceTrack);
    }
  });

  /**
   * @see {@link TrackManager#toggleDevice} for more details.
   */
  const toggleDevice = useCurrentCallback(async () => {
    const currentTrackId = await getCurrentTrackId();
    if (deviceTrack) {
      stopDevice();
      if (currentTrackId) {
        await pauseStreaming(currentTrackId);
      }
    } else {
      const [newTrack, error] = await startDevice();
      if (error) return error;

      if (currentTrackId) {
        await resumeStreaming(currentTrackId, newTrack);
      } else if (peerStatus === "connected") {
        await startStreaming(newTrack, streamConfig);
      }
    }
  });

  useEffect(() => {
    const onJoinedRoom = () => {
      const currentDeviceTrack = getDeviceTrack();
      if (!currentDeviceTrack) return;
      // The handler is sync; observe rejections so non-TrackTypeError failures
      // from addTrack don't surface as unhandledrejection.
      void startStreaming(currentDeviceTrack, streamConfig).catch((err) => {
        if (err instanceof TrackTypeError) return;
        logger.error(err);
      });
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
  }, [startStreaming, tsClient, streamConfig, getDeviceTrack, logger]);

  return {
    deviceTrack,
    currentMiddleware,
    setTrackMiddleware,
    selectDevice,
    toggleMute,
    toggleDevice,
    stopDevice,
    startDevice,
  };
};
