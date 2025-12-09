import { PeerWithTracks } from '@fishjam-cloud/mobile-client';
// import { URL } from 'react-native-url-polyfill';
import { GridTrack } from '../types';

const createGridTracksFromPeer = (peer: PeerWithTracks<unknown, unknown>, isLocal: boolean): GridTrack[] => {
  const tracks: GridTrack[] = [];

  if (peer.cameraTrack) {
    tracks.push({
      track: peer.cameraTrack,
      peerId: peer.id,
      isLocal,
      isVadActive: false,
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
      isVadActive: false,
      aspectRatio: null,
    });
  }

  return tracks;
};

export const parsePeersToTracks = (
  localPeer: PeerWithTracks<unknown, unknown> | null,
  remotePeers: PeerWithTracks<unknown, unknown>[],
): GridTrack[] => [
  ...(localPeer ? createGridTracksFromPeer(localPeer, true) : []),
  ...remotePeers.flatMap((peer) => createGridTracksFromPeer(peer, false)),
];
