import { useEffect, useMemo, useState } from "react";
import { PeerId, PeerMetadata, TrackId, TrackMetadata } from "../types/internal";
import { useFishjamContext } from "./useFishjamContext";
import { TrackContext, VadStatus } from "@fishjam-cloud/ts-client";
import { useFishjamClientState } from "./useFishjamClientState";

export const useVAD = (peerIds: PeerId[]): Record<PeerId, VadStatus> => {
  const { fishjamClientRef } = useFishjamContext();
  const { peers, localPeer } = useFishjamClientState(fishjamClientRef.current);

  const microphoneTracksWithPeerIds = useMemo(
    () =>
      [localPeer, ...Object.values(peers)]
        .filter((peer): peer is NonNullable<typeof peer> => Boolean(peer && peerIds.includes(peer.id)))
        .map((peer) => ({
          peerId: peer.id,
          microphoneTracks: Array.from(peer.tracks.values()).filter((track) => track.metadata?.type === "microphone"),
        })),
    [localPeer, peers, peerIds],
  );

  const getDefaultVadStatuses = () =>
    microphoneTracksWithPeerIds.reduce<Record<PeerId, Record<TrackId, VadStatus>>>(
      (acc, peer) => ({
        ...acc,
        [peer.peerId]: peer.microphoneTracks.reduce((acc, track) => ({ ...acc, [track.trackId]: track.vadStatus }), {}),
      }),
      {},
    );

  const [_vadStatuses, setVadStatuses] = useState<Record<PeerId, Record<TrackId, VadStatus>>>(getDefaultVadStatuses);

  useEffect(() => {
    const unsubs = microphoneTracksWithPeerIds.map(({ peerId, microphoneTracks }) => {
      const updateVadStatus = (track: TrackContext<PeerMetadata, TrackMetadata>) => {
        setVadStatuses((prev) => ({
          ...prev,
          [peerId]: { ...prev[peerId], [track.trackId]: track.vadStatus },
        }));
      };

      microphoneTracks.forEach((track) => {
        track.on("voiceActivityChanged", updateVadStatus);
      });

      return () => {
        microphoneTracks.forEach((track) => {
          track.off("voiceActivityChanged", updateVadStatus);
        });
      };
    });

    return () => unsubs.forEach((unsub) => unsub());
  }, [microphoneTracksWithPeerIds]);

  const vadStatuses = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(_vadStatuses).map(([peerId, tracks]) => [
          peerId,
          Object.values(tracks).some((vad) => vad === "speech") ? "speech" : "silence",
        ]),
      ) satisfies Record<PeerId, VadStatus>,
    [_vadStatuses],
  );

  return vadStatuses;
};
