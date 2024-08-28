import { useFishjamContext } from "./fishjamContext";
import type { PeerState } from "../state.types";
import type { PeerStateWithTracks } from "../types";

function getPeerWithDistinguishedTracks(peerState: PeerState): PeerStateWithTracks {
  const localTracks = Object.values(peerState.tracks ?? {});

  const videoTracks = localTracks.filter(({ track }) => track?.kind === "video");
  const audioTracks = localTracks.filter(({ track }) => track?.kind === "audio");

  return { ...peerState, videoTracks, audioTracks };
}

export function useParticipants() {
  const { state } = useFishjamContext();

  const localParticipant = state.local ? getPeerWithDistinguishedTracks(state.local) : null;

  const participants = Object.values(state.remote).map(getPeerWithDistinguishedTracks);

  return { localParticipant, participants };
}
