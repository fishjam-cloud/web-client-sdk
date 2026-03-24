import type { TrackContext, VadStatus } from "@fishjam-cloud/ts-client";
import { useContext, useEffect, useMemo, useState } from "react";

import { FishjamClientStateContext } from "../contexts/fishjamState";
import type { PeerId, TrackId } from "../types/public";
import { useLocalVAD } from "./useLocalVAD";

/**
 * Voice activity detection. Use this hook to check if voice is detected in audio track for given peer(s).
 *
 * @param options - Options object containing `peerIds` - a list of ids of peers to subscribe to for voice activity detection notifications.
 *
 * Example usage:
 * ```tsx
 * import { useVAD, type PeerId } from "@fishjam-cloud/react-client";
 * function WhoIsTalkingComponent({ peerIds }: { peerIds: PeerId[] }) {
 *   const peersInfo = useVAD({peerIds});
 *   const activePeers = (Object.keys(peersInfo) as PeerId[]).filter((peerId) => peersInfo[peerId]);
 *
 *   return "Now talking: " + activePeers.join(", ");
 * }
 * ```
 * @category Connection
 * @group Hooks
 * @returns Each key is a peerId and the boolean value indicates if voice activity is currently detected for that peer.
 */
export const useVAD = (options: {
  peerIds: ReadonlyArray<PeerId>;
  showLocalPeer?: boolean;
}): Record<PeerId, boolean> => {
  const { peerIds, showLocalPeer } = options;
  const clientState = useContext(FishjamClientStateContext);
  if (!clientState) throw Error("useVAD must be used within FishjamProvider");

  const micTracksWithSelectedPeerIds = useMemo(
    () =>
      Object.values(clientState.peers)
        .filter((peer) => peerIds.includes(peer.id))
        .map((peer) => ({
          peerId: peer.id,
          microphoneTrack: Array.from(peer.tracks.values()).find(({ metadata }) => metadata?.type === "microphone"),
        })),
    [clientState.peers, peerIds],
  );

  const getDefaultVadStatuses = () =>
    micTracksWithSelectedPeerIds.reduce<Record<PeerId, Record<TrackId, VadStatus>>>(
      (mappedTracks, { peerId, microphoneTrack }) => ({
        ...mappedTracks,
        [peerId]: microphoneTrack
          ? { [(microphoneTrack as TrackContext).trackId]: (microphoneTrack as TrackContext).vadStatus }
          : {},
      }),
      {},
    );

  const [_vadStatuses, setVadStatuses] = useState<Record<PeerId, Record<TrackId, VadStatus>>>(getDefaultVadStatuses);

  useEffect(() => {
    const unsubs = micTracksWithSelectedPeerIds.map(({ peerId, microphoneTrack }) => {
      const updateVadStatus = (track: TrackContext) => {
        setVadStatuses((prev) => ({
          ...prev,
          [peerId]: { ...prev[peerId], [track.trackId]: track.vadStatus },
        }));
      };

      if (microphoneTrack) {
        (microphoneTrack as TrackContext).on("voiceActivityChanged", updateVadStatus);
      }

      return () => {
        if (microphoneTrack) {
          (microphoneTrack as TrackContext).off("voiceActivityChanged", updateVadStatus);
        }
      };
    });

    return () => unsubs.forEach((unsub) => unsub());
  }, [micTracksWithSelectedPeerIds]);

  const localVAD = useLocalVAD(clientState.localPeer, showLocalPeer);

  const vadStatuses = useMemo(
    () =>
      ({
        ...Object.fromEntries(
          Object.entries(_vadStatuses).map(([peerId, tracks]) => [
            peerId,
            Object.values(tracks).some((vad) => vad === "speech"),
          ]),
        ),
        ...localVAD,
      }) satisfies Record<PeerId, boolean>,
    [_vadStatuses, localVAD],
  );

  return vadStatuses;
};
