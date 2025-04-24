import { type FishjamClient, type TrackMetadata, TrackTypeError } from "@fishjam-cloud/ts-client";
import { useCallback, useMemo, useRef, useState } from "react";

import type { PeerStatus } from "../../types/public";

type CustomSourceManagerProps = {
  fishjamClient: FishjamClient;
  peerStatus: PeerStatus;
};

export type CustomSource = {
  id: string;
  trackIds?: { videoId?: string; audioId?: string };
  stream?: MediaStream;
};

export type CustomSourceManager = {
  startStreaming: (sourceId: string) => Promise<void>;
  stopStreaming: (sourceId: string) => Promise<void>;
  setStream: (sourceId: string, stream: MediaStream) => Promise<void>;
  getSource: (sourceId: string) => CustomSource;
};

export function useCustomSourceManager({ fishjamClient, peerStatus }: CustomSourceManagerProps): CustomSourceManager {
  const [sources, setSources] = useState<Record<string, CustomSource>>({});
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  const updateSource = useCallback((source: CustomSource) => {
    setSources((oldSources) => ({ ...oldSources, [source.id]: source }));
    sourcesRef.current = { ...sourcesRef.current, [source.id]: source };
  }, []);

  const displayName = useMemo(() => {
    const name = fishjamClient.getLocalPeer()?.metadata?.peer?.displayName;
    if (typeof name == "string") return name;
  }, [fishjamClient]);

  const addTrackToFishjamClient = useCallback(
    async (track: MediaStreamTrack, trackMetadata: TrackMetadata) => {
      try {
        return fishjamClient.addTrack(track, trackMetadata);
      } catch (err) {
        if (err instanceof TrackTypeError) {
          console.warn(err.message);
          return undefined;
        }
        throw err;
      }
    },
    [fishjamClient],
  );

  const startStreaming = useCallback(
    async (sourceId: string) => {
      const source = sourcesRef.current[sourceId];

      const stream = source?.stream;
      if (!source || !stream) {
        console.warn(
          "Attempted to start streaming custom source before registering a MediaStream with setStream, doing nothing.",
        );
        return;
      }

      if (source.trackIds) return;

      updateSource({ ...source, trackIds: {} });

      const video = stream.getVideoTracks().at(0);
      const audio = stream.getAudioTracks().at(0);

      const promises = [];
      if (video) {
        const videoMetadata = { type: "customVideo", displayName, paused: false } as const;
        promises.push(addTrackToFishjamClient(video, videoMetadata));
      }
      if (audio) {
        const audioMetadata = { type: "customAudio", displayName, paused: false } as const;
        promises.push(addTrackToFishjamClient(audio, audioMetadata));
      }

      if (promises.length === 0) {
        console.warn("Attempted to add empty MediaStream as custom source.");
        return;
      }
      const [videoId, audioId] = await Promise.all(promises);

      updateSource({ ...source, trackIds: { videoId, audioId } });
    },
    [addTrackToFishjamClient, displayName, updateSource],
  );

  const stopStreaming = useCallback(
    async (sourceId: string) => {
      const source = sourcesRef.current[sourceId];
      if (!source || !source.trackIds) return;

      const { videoId, audioId } = source.trackIds;
      if (peerStatus === "connected") {
        const promises = [];
        if (videoId) promises.push(fishjamClient.removeTrack(videoId));
        if (audioId) promises.push(fishjamClient.removeTrack(audioId));
        await Promise.all(promises);
      }

      updateSource({ ...source, trackIds: undefined });
    },
    [fishjamClient, peerStatus, updateSource],
  );

  const getSource = useCallback((sourceId: string) => sources[sourceId] ?? { id: sourceId }, [sources]);

  const setStream = useCallback(
    async (sourceId: string, stream: MediaStream) => {
      const source = sourcesRef.current[sourceId] ?? { id: sourceId };
      if (stream === source.stream) return;

      updateSource({ ...source, stream });

      if (!source.trackIds) return;

      await stopStreaming(sourceId);
      await startStreaming(sourceId);
    },
    [stopStreaming, startStreaming, updateSource],
  );

  return { setStream, startStreaming, stopStreaming, getSource };
}
