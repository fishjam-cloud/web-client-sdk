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

  // Replacing a source's stream issues two setStream calls in the same tick (unpublish the old,
  // publish the new). Run concurrently they would read the same snapshot and race to remove the
  // same track IDs — and when the publish call loses that race, the new stream is never
  // published. This chain serializes the calls instead.
  const setStreamQueue = useRef(Promise.resolve());

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

  // Updates both the state (what consumers render) and the ref (what queued setStream calls
  // read synchronously, before React re-renders).
  const updateSources = useCallback(
    (update: (old: Record<string, CustomSourceState>) => Record<string, CustomSourceState>) => {
      sourcesRef.current = update(sourcesRef.current);
      setSources(update);
    },
    [],
  );

  const applySetStream = useCallback(
    async (sourceId: string, stream: MediaStream | null) => {
      const oldSource = sourcesRef.current[sourceId];
      if (stream === oldSource?.stream) return;

      if (oldSource?.trackIds) await removeTracks(oldSource.trackIds);

      if (stream !== null) {
        updateSources((old) => ({ ...old, [sourceId]: { stream } }));
      } else if (oldSource) {
        updateSources((old) => Object.fromEntries(Object.entries(old).filter(([id]) => id !== sourceId)));
      }
    },
    [removeTracks, updateSources],
  );

  const setStream = useCallback(
    (sourceId: string, stream: MediaStream | null) => {
      const run = setStreamQueue.current.then(() => applySetStream(sourceId, stream));
      // Chain a never-rejecting link so one failed call cannot poison the queue; the caller
      // still observes failures through the returned promise.
      setStreamQueue.current = run.catch(() => undefined);
      return run;
    },
    [applySetStream],
  );

  useEffect(() => {
    const onConnected = async () => {
      if (pendingSources.length === 0) return;

      const results = await Promise.all(
        pendingSources.map(async ([id, source]) => [id, await startStreaming(source)] as const),
      );

      // While the tracks were being added, setStream may have unpublished the source or replaced
      // its stream. Record track IDs only where the entry is still the one we started streaming
      // (same stream, still no track IDs) — anything else must not be patched (it would resurrect
      // an unpublished source or attach the IDs to a different stream), and the tracks we just
      // added for it are orphans to unpublish again.
      const isStillCurrent = ([id, started]: (typeof results)[number]) => {
        const current = sourcesRef.current[id];
        return current !== undefined && current.stream === started.stream && current.trackIds === undefined;
      };
      const patch = results.filter(isStillCurrent);
      const orphans = results.filter((result) => !isStillCurrent(result));

      if (patch.length > 0) {
        updateSources((old) => ({ ...old, ...Object.fromEntries(patch) }));
      }
      for (const [, started] of orphans) {
        if (started.trackIds) await removeTracks(started.trackIds);
      }
    };

    const onDisconnected = () => {
      updateSources((old) =>
        Object.fromEntries(Object.entries(old).map(([id, source]) => [id, { ...source, trackIds: undefined }])),
      );
    };

    // addTrack can reject for reasons other than TrackTypeError (e.g. a disconnect mid-add);
    // surface it instead of leaving an unhandled rejection.
    if (peerStatus === "connected")
      onConnected().catch((error) => logger.error("Failed to publish custom sources", error));

    fishjamClient.on("disconnected", onDisconnected);
    return () => {
      fishjamClient.off("disconnected", onDisconnected);
    };
  }, [pendingSources, fishjamClient, peerStatus, startStreaming, removeTracks, updateSources, logger]);

  return { setStream, getSource };
}
