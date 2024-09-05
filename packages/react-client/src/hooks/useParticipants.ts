import type { PeerState } from "../state.types";
import type { PeerStateWithTracks } from "../types";
import { useFishjamClient } from "./useFishjamClient";

function getPeerWithDistinguishedTracks(peerState: PeerState): PeerStateWithTracks {
  const peerTracks = Object.values(peerState.tracks ?? {});

  const cameraTracks = peerTracks.filter(({ metadata }) => metadata?.type === "camera");
  const microphoneTracks = peerTracks.filter(({ metadata }) => metadata?.type === "microphone");
  const screenshareVideoTracks = peerTracks.filter(({ metadata }) => metadata?.type === "screenShareVideo");
  const screenshareAudioTracks = peerTracks.filter(({ metadata }) => metadata?.type === "screenShareAudio");

  return { ...peerState, cameraTracks, microphoneTracks, screenshareVideoTracks, screenshareAudioTracks };
}

export function useParticipants() {
  const { peers, localPeer } = useFishjamClient();

  const localParticipant = localPeer ? getPeerWithDistinguishedTracks(localPeer) : null;
  const participants = Object.values(peers).map(getPeerWithDistinguishedTracks);

  return { localParticipant, participants };
}
