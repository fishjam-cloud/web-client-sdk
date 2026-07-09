/**
 * Charades room roster: who is the host, who are the viewers.
 *
 * Every peer joins the room with `CharadesPeerMetadata` in its peer metadata,
 * so any client can classify the other peers by role. The host publishes the
 * charades composite as a virtual camera track (`videoType: 'camera'` in
 * `useCharadesCameraEffect`), which means viewers find the drawing video
 * simply at `findHostPeer(remotePeers)?.cameraTrack`.
 */

export type CharadesRole = 'host' | 'viewer';

/** Peer metadata every charades participant sets when joining the room. */
export interface CharadesPeerMetadata {
  displayName: string;
  role: CharadesRole;
}

/**
 * The SDK wraps peer metadata as `{ peer, server }`; game code only cares
 * about the peer-provided part. Structural (not the SDK's PeerWithTracks)
 * so the helpers work for both local and remote peer shapes.
 */
interface PeerWithCharadesMetadata {
  metadata?: {
    peer?: CharadesPeerMetadata;
  };
}

export function findHostPeer<Peer extends PeerWithCharadesMetadata>(
  remotePeers: Peer[],
): Peer | undefined {
  return remotePeers.find((peer) => peer.metadata?.peer?.role === 'host');
}

/**
 * Everyone who is not the host counts as a viewer — including peers with
 * missing/unknown metadata (e.g. someone joining from a non-charades client),
 * so their tiles still show up instead of silently disappearing.
 */
export function selectViewerPeers<Peer extends PeerWithCharadesMetadata>(
  remotePeers: Peer[],
): Peer[] {
  return remotePeers.filter((peer) => peer.metadata?.peer?.role !== 'host');
}
