import type { TrackContext, VadStatus } from "@fishjam-cloud/ts-client";
import { useContext, useEffect, useMemo, useState } from "react";

import { FishjamClientStateContext } from "../contexts/fishjamState";
import type { PeerId, TrackId } from "../types/public";

/**
 * Voice activity detection. Use this hook to check if voice is detected in audio track for given peer(s).
 *
 * Example usage:
 * ```tsx
 * function WhoIsTalkingComponent({ peerIds }: { peerIds: PeerId[] }) {
 *   const peersInfo = useVAD({peerIds});
 *   const activePeers = (Object.keys(peersInfo) as PeerId[]).filter((peerId) => peersInfo[peerId]);
 *
 *   return `Now talking: ${activePeers.join(", ")}`;
 * }
 * ```
 * @param peerIds List of ids of peers to subscribe to for voice activity detection notifications.
 * @category Connection
 * @group Hooks
 * @returns Each key is a peerId and the boolean value indicates if voice activity is currently detected for that peer.
 */
export const useVAD = ({ peerIds }: { peerIds: ReadonlyArray<PeerId> }): Record<PeerId, boolean> => {
  const clientState = useContext(FishjamClientStateContext);
  if (!clientState) throw Error("useVAD must be used within FishjamProvider");

  const micTracksWithSelectedPeerIds = useMemo(
    () =>
      Object.values(clientState.peers)
        .filter((peer) => peerIds.includes(peer.id))
        .map((peer) => ({
          peerId: peer.id,
          microphoneTracks: Array.from(peer.tracks.values()).filter(({ metadata }) => metadata?.type === "microphone"),
        })),
    [clientState.peers, peerIds],
  );

  const getDefaultVadStatuses = () =>
    micTracksWithSelectedPeerIds.reduce<Record<PeerId, Record<TrackId, VadStatus>>>(
      (mappedTracks, peer) => ({
        ...mappedTracks,
        [peer.peerId]: peer.microphoneTracks.reduce(
          (vadStatuses, track) => ({ ...vadStatuses, [track.trackId]: track.vadStatus }),
          {},
        ),
      }),
      {},
    );

  const [_vadStatuses, setVadStatuses] = useState<Record<PeerId, Record<TrackId, VadStatus>>>(getDefaultVadStatuses);

  useEffect(() => {
    const unsubs = micTracksWithSelectedPeerIds.map(({ peerId, microphoneTracks }) => {
      const updateVadStatus = (track: TrackContext) => {
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
  }, [micTracksWithSelectedPeerIds]);

  const vadStatuses = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(_vadStatuses).map(([peerId, tracks]) => [
          peerId,
          Object.values(tracks).some((vad) => vad === "speech"),
        ]),
      ) satisfies Record<PeerId, boolean>,
    [_vadStatuses],
  );

  return vadStatuses;
};
