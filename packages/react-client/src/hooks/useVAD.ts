import { useContext, useEffect, useMemo, useReducer } from "react";

import { FishjamClientStateContext } from "../contexts/fishjamState";
import type { PeerId } from "../types/public";
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
  const showLocalPeerVAD = useMemo(
    () => (clientState.localPeer?.id ? peerIds.includes(clientState.localPeer?.id) : false),
    [clientState.localPeer?.id, peerIds],
  );

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

  // `voiceActivityChanged` mutates the track context in place and does not flow through
  // `useFishjamClientState`, so we need an explicit re-render trigger to re-read the
  // current `vadStatus` off each mic track.
  const [version, bumpVersion] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const unsubs = micTracksWithSelectedPeerIds.map(({ microphoneTrack }) => {
      if (!microphoneTrack) return () => {};

      microphoneTrack.on("voiceActivityChanged", bumpVersion);

      return () => {
        microphoneTrack.off("voiceActivityChanged", bumpVersion);
      };
    });

    return () => unsubs.forEach((unsub) => unsub());
  }, [micTracksWithSelectedPeerIds]);

  const localVAD = useLocalVAD({ disabled: !showLocalPeerVAD });

  const vadStatuses = useMemo(() => {
    // Referencing `version` makes the memo recompute on every `voiceActivityChanged`
    // event, so we re-read each current mic track's mutable `vadStatus`.
    void version;
    return {
      ...Object.fromEntries(
        micTracksWithSelectedPeerIds.map(({ peerId, microphoneTrack }) => [
          peerId,
          microphoneTrack?.vadStatus === "speech",
        ]),
      ),
      ...localVAD,
    } satisfies Record<PeerId, boolean>;
  }, [micTracksWithSelectedPeerIds, localVAD, version]);

  return vadStatuses;
};
