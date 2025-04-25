import { type FishjamClient, type TrackMetadata, TrackTypeError } from "@fishjam-cloud/ts-client";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CustomSourceState, CustomSourceTracks } from "../../types/internal";
import type { PeerStatus } from "../../types/public";

type CustomSourceManagerProps = {
  fishjamClient: FishjamClient;
  peerStatus: PeerStatus;
};

export type CustomSourceManager = {
  setStream: (sourceId: string, stream: MediaStream | null) => Promise<void>;
  getSource: (sourceId: string) => CustomSourceState | undefined;
};

export function useCustomSourceManager({ fishjamClient, peerStatus }: CustomSourceManagerProps): CustomSourceManager {
  const [sources, setSources] = useState<Record<string, CustomSourceState>>({});
  const pendingSources = useMemo(
    () => Object.entries(sources).filter(([_, source]) => source.trackIds === undefined),
    [sources],
  );

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
    async (source: CustomSourceState): Promise<CustomSourceState> => {
      const stream = source?.stream;

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
        return source;
      }
      const [videoId, audioId] = await Promise.all(promises);
      return { ...source, trackIds: { videoId, audioId } };
    },
    [addTrackToFishjamClient, displayName],
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
      const oldSource = sources[sourceId];
      if (stream === oldSource?.stream) return;

      if (oldSource?.trackIds) await removeTracks(oldSource.trackIds);

      if (stream !== null) {
        setSources((old) => ({ ...old, [sourceId]: { stream } }));
        return;
      }
      if (!oldSource) return;

      setSources((old) => Object.fromEntries(Object.entries(old).filter(([id, _]) => id !== sourceId)));
    },
    [sources, removeTracks],
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

  console.log("rerendered custom source manager", [fishjamClient, peerStatus, startStreaming, pendingSources, sources]);

  return { setStream, getSource };
}
