import type { Component, Endpoint, Peer, TrackContext } from "@fishjam-cloud/ts-client";
import type { PeerMetadata, PeerState, TrackId, TrackMetadata } from "../types/internal";
import type { PeerWithTracks, Track } from "../types/public";
import { useFishjamContext } from "./useFishjamContext";

function getPeerWithDistinguishedTracks(peerState: PeerState): PeerWithTracks {
  const peerTracks = Object.values(peerState.tracks ?? {});

  const cameraTrack = peerTracks.find(({ metadata }) => metadata?.type === "camera");
  const microphoneTrack = peerTracks.find(({ metadata }) => metadata?.type === "microphone");
  const screenShareVideoTrack = peerTracks.find(({ metadata }) => metadata?.type === "screenShareVideo");
  const screenShareAudioTrack = peerTracks.find(({ metadata }) => metadata?.type === "screenShareAudio");

  return { ...peerState, cameraTrack, microphoneTrack, screenShareVideoTrack, screenShareAudioTrack };
}

function trackContextToTrack(track: TrackContext<PeerMetadata, TrackMetadata>): Track {
  return {
    metadata: track.metadata,
    trackId: track.trackId,
    stream: track.stream,
    simulcastConfig: track.simulcastConfig ?? null,
    encoding: track.encoding ?? null,
    vadStatus: track.vadStatus,
    track: track.track,
  };
}

function endpointToPeerState(
  peer:
    | Peer<PeerMetadata, TrackMetadata>
    | Component<PeerMetadata, TrackMetadata>
    | Endpoint<PeerMetadata, TrackMetadata>,
): PeerState {
  const tracks = [...peer.tracks].reduce(
    (acc, [, track]) => ({ ...acc, [track.trackId]: trackContextToTrack(track) }),
    {} as Record<TrackId, Track>,
  );
  return {
    metadata: peer.metadata,
    id: peer.id,
    tracks,
  };
}

/**
 * Result type for the usePeers hook.
 */
export type UsePeersResult = {
  /**
   * The local peer with distinguished tracks (camera, microphone, screen share).
   * Will be null if the local peer is not found.
   */
  localPeer: PeerWithTracks | null;

  /**
   * Array of remote peers with distinguished tracks (camera, microphone, screen share).
   */
  remotePeers: PeerWithTracks[];

  /**
   * @deprecated Use remotePeers instead
   * Legacy array containing remote peers.
   * This property will be removed in future versions.
   */
  peers: PeerWithTracks[];
};

/**
 *
 * @category Connection
 */
export function usePeers(): UsePeersResult {
  const { clientState } = useFishjamContext();

  const localPeer = clientState.localPeer
    ? getPeerWithDistinguishedTracks(endpointToPeerState(clientState.localPeer))
    : null;

  const remotePeers = Object.values(clientState.peers).map((peer) =>
    getPeerWithDistinguishedTracks(endpointToPeerState(peer)),
  );

  return { localPeer, remotePeers, peers: remotePeers };
}
