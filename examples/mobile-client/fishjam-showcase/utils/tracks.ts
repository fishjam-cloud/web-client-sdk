import type { PeerWithTracks, Track } from '@fishjam-cloud/react-native-client';

export type GridTrack = {
  track: Track | null;
  peerId: string;
  isLocal: boolean;
  isVadActive: boolean;
  aspectRatio: number | null;
};

const createGridTracksFromPeer = (
  peer: PeerWithTracks<unknown, unknown>,
  isLocal: boolean,
  isVadActive: boolean,
): GridTrack[] => {
  const tracks: GridTrack[] = [];

  if (peer.cameraTrack) {
    tracks.push({
      track: peer.cameraTrack,
      peerId: peer.id,
      isLocal,
      isVadActive,
      aspectRatio: null,
    });
  }

  if (peer.screenShareVideoTrack) {
    tracks.push({
      track: peer.screenShareVideoTrack,
      peerId: peer.id,
      isLocal,
      isVadActive: false,
      aspectRatio: null,
    });
  }

  if (tracks.length === 0) {
    tracks.push({
      track: null,
      peerId: peer.id,
      isLocal,
      isVadActive,
      aspectRatio: null,
    });
  }

  return tracks;
};

export const parsePeersToTracks = (
  localPeer: PeerWithTracks<unknown, unknown> | null,
  remotePeers: PeerWithTracks<unknown, unknown>[],
  vadByPeerId: Record<string, boolean> = {},
): GridTrack[] => [
  ...(localPeer
    ? createGridTracksFromPeer(
        localPeer,
        true,
        vadByPeerId[localPeer.id] ?? false,
      )
    : []),
  ...remotePeers.flatMap((peer) =>
    createGridTracksFromPeer(peer, false, vadByPeerId[peer.id] ?? false),
  ),
];
