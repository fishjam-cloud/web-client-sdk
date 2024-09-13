import type { FishjamClient, SimulcastConfig, TrackBandwidthLimit } from "@fishjam-cloud/ts-client";
import type { MediaManager, PeerMetadata, ToggleMode, TrackManager, TrackMetadata, TrackMiddleware } from "../types";
import { getRemoteOrLocalTrack } from "../utils/track";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PeerStatus } from "../state.types";

interface TrackManagerConfig {
  mediaManager: MediaManager;
  tsClient: FishjamClient<PeerMetadata, TrackMetadata>;
  getCurrentPeerStatus: () => PeerStatus;
}

const TRACK_TYPE_TO_DEVICE = {
  video: "camera",
  audio: "microphone",
} as const;

export const useTrackManager = ({ mediaManager, tsClient, getCurrentPeerStatus }: TrackManagerConfig): TrackManager => {
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [paused, setPaused] = useState<boolean>(false);
  const clearMiddlewareFnRef = useRef<(() => void) | null>(null);

  const [currentTrackMiddleware, setCurrentTrackMiddleware] = useState<TrackMiddleware>(null);
  const type = TRACK_TYPE_TO_DEVICE[mediaManager.getDeviceType()];

  const metadata: TrackMetadata = { type, paused };

  useEffect(() => {
    const disconnectedHandler = () => {
      setCurrentTrackId(null);
    };

    tsClient.on("disconnected", disconnectedHandler);
    return () => {
      tsClient.off("disconnected", disconnectedHandler);
    };
  }, [tsClient]);

  const currentTrack = useMemo(() => getRemoteOrLocalTrack(tsClient, currentTrackId), [tsClient, currentTrackId]);

  function clearMiddleware() {
    clearMiddlewareFnRef.current?.();
    clearMiddlewareFnRef.current = null;
  }

  function clearAndGetProcessedTrack(inputTrack: MediaStreamTrack): MediaStreamTrack {
    clearMiddleware();
    const { onClear, track } = currentTrackMiddleware?.(inputTrack) ?? {};
    if (onClear) clearMiddlewareFnRef.current = onClear;
    return track ?? inputTrack;
  }

  async function setTrackMiddleware(middleware: TrackMiddleware): Promise<void> {
    const mediaTrack = mediaManager.getTracks()[0];
    setCurrentTrackMiddleware(() => middleware);
    if (!currentTrack || !mediaTrack) return;

    clearMiddleware();
    const { onClear, track } = middleware?.(mediaTrack) ?? { track: mediaTrack };
    if (onClear) clearMiddlewareFnRef.current = onClear;

    await tsClient.replaceTrack(currentTrack.trackId, track);
  }

  async function initialize(deviceId?: string) {
    await mediaManager?.start(deviceId ?? true);
    if (!currentTrackId) return;
    const newTrack = mediaManager.getTracks()[0];
    await tsClient.replaceTrack(currentTrackId, clearAndGetProcessedTrack(newTrack));
  }

  function stop() {
    clearMiddleware();
    return mediaManager?.stop();
  }

  async function startStreaming(simulcastConfig?: SimulcastConfig, maxBandwidth?: TrackBandwidthLimit) {
    if (currentTrackId) throw Error("Track already added");

    const media = mediaManager.getMedia();

    if (!media || !media.stream || !media.track) throw Error("Device is unavailable");

    const track = getRemoteOrLocalTrack(tsClient, currentTrackId);

    if (track) return track.trackId;

    // see `getRemoteOrLocalTrackContext()` explanation
    setCurrentTrackId(media.track.id);

    const displayName = tsClient.getLocalPeer()?.metadata?.displayName;

    const trackMetadata: TrackMetadata = { ...metadata, displayName, paused: false };

    const processedTrack = clearAndGetProcessedTrack(media.track);

    const remoteTrackId = await tsClient.addTrack(processedTrack, trackMetadata, simulcastConfig, maxBandwidth);

    setCurrentTrackId(remoteTrackId);
    setPaused(false);

    return remoteTrackId;
  }

  async function refreshStreamedTrack() {
    if (!currentTrack) return;

    const newTrack = mediaManager.getTracks()[0];
    if (!newTrack) throw Error("New track is empty");
    return tsClient.replaceTrack(currentTrack.trackId, clearAndGetProcessedTrack(newTrack));
  }

  async function stopStreaming() {
    if (!currentTrack) return;
    clearMiddleware();
    setCurrentTrackId(null);
    setPaused(true);
    return tsClient.removeTrack(currentTrack.trackId);
  }

  async function pauseStreaming() {
    if (!currentTrack) return;

    setPaused(true);
    await tsClient.replaceTrack(currentTrack.trackId, null);

    const trackMetadata: TrackMetadata = { ...metadata, paused: true };

    return tsClient.updateTrackMetadata(currentTrack.trackId, trackMetadata);
  }

  async function resumeStreaming() {
    if (!currentTrack) return;

    const media = mediaManager.getMedia();

    if (!media) throw Error("Device is unavailable");
    const processedTrack = media.track ? clearAndGetProcessedTrack(media.track) : null;
    setPaused(false);
    await tsClient.replaceTrack(currentTrack.trackId, processedTrack);

    const trackMetadata: TrackMetadata = { ...metadata, paused: false };

    return tsClient.updateTrackMetadata(currentTrack.trackId, trackMetadata);
  }

  function disableTrack() {
    mediaManager.disable();
  }

  function enableTrack() {
    mediaManager.enable();
  }

  const stream = async () => {
    if (getCurrentPeerStatus() !== "joined") return;

    if (currentTrack?.trackId) {
      await resumeStreaming();
    } else {
      await startStreaming();
    }
  };

  /**
   * @see {@link TrackManager#toggle} for more details.
   */
  async function toggle(mode: ToggleMode = "hard") {
    const mediaStream = mediaManager.getMedia()?.stream;
    const track = mediaManager.getTracks()?.[0];
    const enabled = Boolean(track?.enabled);

    if (mediaStream && enabled) {
      mediaManager.disable();
      if (currentTrack?.trackId) {
        await pauseStreaming();
      }

      if (mode === "hard") {
        await mediaManager.stop();
      }
    } else if (mediaStream && !enabled) {
      mediaManager.enable();
      await stream();
    } else {
      await mediaManager.start(true);
      await stream();
    }
  }

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
    currentTrackMiddleware,
    refreshStreamedTrack,
    paused,
    toggle,
  };
};
