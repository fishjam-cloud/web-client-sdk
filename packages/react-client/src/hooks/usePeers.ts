import type { PeerState } from "../types/internal";
import type { PeerWithTracks } from "../types/public";
import { useFishjamContext } from "./useFishjamContext";

function getPeerWithDistinguishedTracks(peerState: PeerState): PeerWithTracks {
  const peerTracks = Object.values(peerState.tracks ?? {});

  const cameraTrack = peerTracks.find(({ metadata }) => metadata?.type === "camera");
  const microphoneTrack = peerTracks.find(({ metadata }) => metadata?.type === "microphone");
  const screenShareVideoTrack = peerTracks.find(({ metadata }) => metadata?.type === "screenShareVideo");
  const screenShareAudioTrack = peerTracks.find(({ metadata }) => metadata?.type === "screenShareAudio");

  return { ...peerState, cameraTrack, microphoneTrack, screenShareVideoTrack, screenShareAudioTrack };
}

/**
 *
 * @category Connection
 */
export function usePeers() {
  const { clientState } = useFishjamContext();

  const localPeer = clientState.localPeer ? getPeerWithDistinguishedTracks(clientState.localPeer) : null;
  const peers = Object.values(clientState.peers).map(getPeerWithDistinguishedTracks);

  return { localPeer, peers };
}
