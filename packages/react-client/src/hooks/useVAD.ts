import type { TrackContext, VadStatus } from "@fishjam-cloud/ts-client";
import { useContext, useEffect, useMemo, useState } from "react";

import { FishjamClientContext } from "../contexts/fishjamClient";
import { FishjamClientStateContext } from "../contexts/fishjamState";
import type { PeerId, TrackId } from "../types/public";

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
export const useVAD = (options: { peerIds: ReadonlyArray<PeerId> }): Record<PeerId, boolean> => {
  const { peerIds } = options;
  const clientState = useContext(FishjamClientStateContext);
  if (!clientState) throw Error("useVAD must be used within FishjamProvider");

  const fishjamClient = useContext(FishjamClientContext);

  const micTracksWithSelectedPeerIds = useMemo(() => {
    const result = Object.values(clientState.peers)
      .filter((peer) => peerIds.includes(peer.id))
      .map((peer) => ({
        peerId: peer.id,
        microphoneTracks: Array.from(peer.tracks.values()).filter(({ metadata }) => metadata?.type === "microphone"),
        isLocal: false,
      }));

    const localPeer = clientState.localPeer;
    if (localPeer && peerIds.includes(localPeer.id)) {
      result.push({
        peerId: localPeer.id,
        microphoneTracks: Array.from(localPeer.tracks.values()).filter(
          ({ metadata }) => metadata?.type === "microphone",
        ),
        isLocal: true,
      });
    }

    return result;
  }, [clientState.peers, clientState.localPeer, peerIds]);

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

  useEffect(() => {
    const localPeerEntry = micTracksWithSelectedPeerIds.find((e) => e.isLocal);
    if (!localPeerEntry || localPeerEntry.microphoneTracks.length === 0) return;

    // above -32 dBov -> speech, below -> silence, scaled to [0, 1] range gives us ~0.025 threshold
    const THRESHOLD = 0.025;
    const intervals = localPeerEntry.microphoneTracks.map((track) => {
      let lastStatus: VadStatus = "silence";
      return setInterval(async () => {
        const level = await fishjamClient?.current?.getLocalTrackAudioLevel(track.trackId);
        if (level == null) return;
        const newStatus: VadStatus = level > THRESHOLD ? "speech" : "silence";
        if (newStatus !== lastStatus) {
          lastStatus = newStatus;
          fishjamClient?.current?.setLocalTrackVadStatus(track.trackId, newStatus);
        }
      }, 100);
    });

    return () => intervals.forEach(clearInterval);
  }, [micTracksWithSelectedPeerIds, fishjamClient]);

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
