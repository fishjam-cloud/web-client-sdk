import type { FishjamTrackContext, VadStatus } from "@fishjam-cloud/ts-client";
import { useContext, useEffect, useMemo, useState } from "react";

import { FishjamClientStateContext } from "../contexts/fishjamState";
import type { PeerId, TrackId } from "../types/public";
import { useLocalVAD } from "./useLocalVAD";

/**
 * Voice activity detection. Use this hook to check if voice is detected in the audio track for given peer(s).
 *
 * Remote peer VAD is driven by `vadNotification` messages from the backend.
 * If the local peer's id is included in `peerIds`, local VAD is determined client-side
 * by polling the microphone's audio level (see `useLocalVAD`).
 *
 * @param options - Options object.
 * @param options.peerIds - List of peer ids to subscribe to for VAD notifications.
 *   Include the local peer's id to also track whether the local user is speaking.
 *
 * Example usage:
 * ```tsx
 * import { useVAD, type PeerId } from "@fishjam-cloud/react-client";
 *
 * function WhoIsTalkingComponent({ peerIds }: { peerIds: PeerId[] }) {
 *   const peersInfo = useVAD({ peerIds });
 *   const activePeers = (Object.keys(peersInfo) as PeerId[]).filter((peerId) => peersInfo[peerId]);
 *
 *   return "Now talking: " + activePeers.join(", ");
 * }
 * ```
 * @category Connection
 * @group Hooks
 * @returns A record where each key is a peer id and the boolean value indicates
 * whether voice activity is currently detected for that peer.
 */
export const useVAD = (options: { peerIds: ReadonlyArray<PeerId> }): Record<PeerId, boolean> => {
  const { peerIds } = options;
  const clientState = useContext(FishjamClientStateContext);
  if (!clientState) throw Error("useVAD must be used within FishjamProvider");
  const showLocalPeerVAD = clientState.localPeer?.id ? peerIds.includes(clientState.localPeer?.id) : false;

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
        [peerId]: microphoneTrack ? { [microphoneTrack.trackId]: microphoneTrack.vadStatus } : {},
      }),
      {},
    );

  const [_vadStatuses, setVadStatuses] = useState<Record<PeerId, Record<TrackId, VadStatus>>>(getDefaultVadStatuses);

  useEffect(() => {
    const unsubs = micTracksWithSelectedPeerIds.map(({ peerId, microphoneTrack }) => {
      const updateVadStatus = (track: FishjamTrackContext) => {
        setVadStatuses((prev) => ({
          ...prev,
          [peerId]: { ...prev[peerId], [track.trackId]: track.vadStatus },
        }));
      };

      if (microphoneTrack) {
        microphoneTrack.on("voiceActivityChanged", updateVadStatus);
      }

      return () => {
        if (microphoneTrack) {
          microphoneTrack.off("voiceActivityChanged", updateVadStatus);
        }
      };
    });

    return () => unsubs.forEach((unsub) => unsub());
  }, [micTracksWithSelectedPeerIds]);

  const localVAD = useLocalVAD({ disabled: !showLocalPeerVAD });

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
