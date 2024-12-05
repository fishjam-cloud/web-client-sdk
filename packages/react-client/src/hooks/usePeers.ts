import type {
  Component,
  Endpoint,
  FishjamTrackContext,
  Peer,
  TrackContext,
  TrackMetadata,
} from "@fishjam-cloud/ts-client";

import type { DistinguishedTracks, PeerState } from "../types/internal";
import type { Track } from "../types/public";
import { useFishjamContext } from "./internal/useFishjamContext";

export type PeerWithTracks<P, S> = PeerState<P, S> & DistinguishedTracks;

function trackContextToTrack(track: FishjamTrackContext | TrackContext): Track {
  return {
    metadata: track.metadata as TrackMetadata,
    trackId: track.trackId,
    stream: track.stream,
    simulcastConfig: track.simulcastConfig ?? null,
    encoding: track.encoding ?? null,
    vadStatus: track.vadStatus,
    track: track.track,
  };
}

function getPeerWithDistinguishedTracks<P, S>(peer: Peer<P, S> | Component | Endpoint): PeerWithTracks<P, S> {
  const tracks = [...peer.tracks.values()].map(trackContextToTrack);

  const cameraTrack = tracks.find(({ metadata }) => metadata?.type === "camera");
  const microphoneTrack = tracks.find(({ metadata }) => metadata?.type === "microphone");
  const screenShareVideoTrack = tracks.find(({ metadata }) => metadata?.type === "screenShareVideo");
  const screenShareAudioTrack = tracks.find(({ metadata }) => metadata?.type === "screenShareAudio");

  return {
    id: peer.id,
    metadata: peer.metadata as Peer<P, S>["metadata"],
    tracks,
    cameraTrack,
    microphoneTrack,
    screenShareVideoTrack,
    screenShareAudioTrack,
  };
}

/**
 * Result type for the usePeers hook.
 */
export type UsePeersResult<P, S> = {
  /**
   * The local peer with distinguished tracks (camera, microphone, screen share).
   * Will be null if the local peer is not found.
   */
  localPeer: PeerWithTracks<P, S> | null;

  /**
   * Array of remote peers with distinguished tracks (camera, microphone, screen share).
   */
  remotePeers: PeerWithTracks<P, S>[];

  /**
   * @deprecated Use remotePeers instead
   * Legacy array containing remote peers.
   * This property will be removed in future versions.
   */
  peers: PeerWithTracks<P, S>[];
};

/**
 *
 * @category Connection
 *
 * @typeParam P Type of metadata set by peer while connecting to a room.
 * @typeParam S Type of metadata set by the server while creating a peer.
 */
export function usePeers<P = Record<string, unknown>, S = Record<string, unknown>>(): UsePeersResult<P, S> {
  const { clientState } = useFishjamContext();

  const localPeer = clientState.localPeer ? getPeerWithDistinguishedTracks<P, S>(clientState.localPeer) : null;

  const remotePeers = Object.values(clientState.peers).map((peer) => getPeerWithDistinguishedTracks<P, S>(peer));

  return { localPeer, remotePeers, peers: remotePeers };
}
