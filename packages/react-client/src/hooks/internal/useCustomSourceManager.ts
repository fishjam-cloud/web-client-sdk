import { type FishjamClient, type Logger, type TrackMetadata, TrackTypeError } from "@fishjam-cloud/ts-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CustomSourceState, CustomSourceTracks } from "../../types/internal";
import type { PeerStatus } from "../../types/public";

type CustomSourceManagerProps = {
  fishjamClient: FishjamClient;
  peerStatus: PeerStatus;
  logger: Logger;
};

export type CustomSourceManager = {
  setStream: (sourceId: string, stream: MediaStream | null) => Promise<void>;
  getSource: (sourceId: string) => CustomSourceState | undefined;
};

export function useCustomSourceManager({
  fishjamClient,
  peerStatus,
  logger,
}: CustomSourceManagerProps): CustomSourceManager {
  const [sources, setSources] = useState<Record<string, CustomSourceState>>({});
  // setStream reads the current sources synchronously (to diff against the old stream and to
  // remove stale tracks), but must stay referentially stable so consumers can safely depend on
  // it in effects. Reading through a ref keeps it out of the useCallback deps.
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  const pendingSources = useMemo(
    () => Object.entries(sources).filter(([_, source]) => source.trackIds === undefined),
    [sources],
  );

  const getDisplayName = useCallback(() => {
    const name = fishjamClient.getLocalPeer()?.metadata?.peer?.displayName;
    if (typeof name == "string") return name;
  }, [fishjamClient]);

  const addTrackToFishjamClient = useCallback(
    async (track: MediaStreamTrack, trackMetadata: TrackMetadata) => {
      try {
        return fishjamClient.addTrack(track, trackMetadata);
      } catch (err) {
        if (err instanceof TrackTypeError) {
          logger.warn(err.message);
          return undefined;
        }
        throw err;
      }
    },
    [fishjamClient, logger],
  );

  const startStreaming = useCallback(
    async (source: CustomSourceState): Promise<CustomSourceState> => {
      const stream = source?.stream;

      const video = stream.getVideoTracks().at(0);
      const audio = stream.getAudioTracks().at(0);

      const promises = [];
      const displayName = getDisplayName();
      if (video) {
        const videoMetadata = { type: "customVideo", displayName, paused: false } as const;
        promises.push(addTrackToFishjamClient(video, videoMetadata));
      }
      if (audio) {
        const audioMetadata = { type: "customAudio", displayName, paused: false } as const;
        promises.push(addTrackToFishjamClient(audio, audioMetadata));
      }

      if (promises.length === 0) {
        logger.warn("Attempted to add empty MediaStream as custom source.");
        return source;
      }
      const [videoId, audioId] = await Promise.all(promises);
      return { ...source, trackIds: { videoId, audioId } };
    },
    [addTrackToFishjamClient, getDisplayName, logger],
  );

  const removeTracks = useCallback(
    async ({ videoId, audioId }: CustomSourceTracks) => {
      const promises = [];
      if (videoId) promises.push(fishjamClient.removeTrack(videoId));
      if (audioId) promises.push(fishjamClient.removeTrack(audioId));
      await Promise.all(promises);
    },
    [fishjamClient],
  );

  const getSource = useCallback((sourceId: string) => sources[sourceId], [sources]);

  const setStream = useCallback(
    async (sourceId: string, stream: MediaStream | null) => {
      // Note: the ref only advances on re-render, so two calls for the same source in the same
      // tick both read the same snapshot and both try to remove the same track IDs; the loser's
      // removeTracks rejects ("Cannot find <trackId>"). Pre-existing behavior — the old
      // closure-captured `sources` had the same window.
      const oldSource = sourcesRef.current[sourceId];
      if (stream === oldSource?.stream) return;

      if (oldSource?.trackIds) await removeTracks(oldSource.trackIds);

      if (stream !== null) {
        setSources((old) => ({ ...old, [sourceId]: { stream } }));
        return;
      }
      if (!oldSource) return;

      setSources((old) => Object.fromEntries(Object.entries(old).filter(([id, _]) => id !== sourceId)));
    },
    [removeTracks],
  );

  useEffect(() => {
    const onConnected = async () => {
      if (pendingSources.length === 0) return;

      const patch = Object.fromEntries(
        await Promise.all(pendingSources.map(async ([id, source]) => [id, await startStreaming(source)] as const)),
      );
      setSources((old) => ({ ...old, ...patch }));
    };

    const onDisconnected = () => {
      setSources((old) =>
        Object.fromEntries(Object.entries(old).map(([id, source]) => [id, { ...source, trackIds: undefined }])),
      );
    };

    if (peerStatus === "connected") onConnected();

    fishjamClient.on("disconnected", onDisconnected);
    return () => {
      fishjamClient.off("disconnected", onDisconnected);
    };
  }, [pendingSources, fishjamClient, peerStatus, startStreaming]);

  return { setStream, getSource };
}
