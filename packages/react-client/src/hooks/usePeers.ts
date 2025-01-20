import type { FishjamTrackContext, Metadata, Peer, TrackContext, TrackMetadata } from "@fishjam-cloud/ts-client";

import type { BrandedPeer } from "../types/internal";
import type { PeerId, Track, TrackId } from "../types/public";
import { useFishjamContext } from "./internal/useFishjamContext";

/**
 *
 * @category Connection
 * @typeParam PeerMetadata Type of metadata set by peer while connecting to a room.
 * @typeParam ServerMetadata Type of metadata set by the server while creating a peer.
 */
export type PeerWithTracks<PeerMetadata, ServerMetadata> = {
  id: PeerId;
  metadata?: Metadata<PeerMetadata, ServerMetadata>;
  tracks: Track[];
  cameraTrack?: Track;
  microphoneTrack?: Track;
  screenShareVideoTrack?: Track;
  screenShareAudioTrack?: Track;
};

function trackContextToTrack(track: FishjamTrackContext | TrackContext): Track {
  return {
    metadata: track.metadata as TrackMetadata,
    trackId: track.trackId as TrackId,
    stream: track.stream,
    simulcastConfig: track.simulcastConfig ?? null,
    encoding: track.encoding ?? null,
    track: track.track,
  };
}

function getPeerWithDistinguishedTracks<P, S>(peer: BrandedPeer<P, S>): PeerWithTracks<P, S> {
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
 *
 * @category Connection
 * @typeParam PeerMetadata Type of metadata set by peer while connecting to a room.
 * @typeParam ServerMetadata Type of metadata set by the server while creating a peer.
 */
export type UsePeersResult<PeerMetadata, ServerMetadata> = {
  /**
   * The local peer with distinguished tracks (camera, microphone, screen share).
   * Will be null if the local peer is not found.
   */
  localPeer: PeerWithTracks<PeerMetadata, ServerMetadata> | null;

  /**
   * Array of remote peers with distinguished tracks (camera, microphone, screen share).
   */
  remotePeers: PeerWithTracks<PeerMetadata, ServerMetadata>[];

  /**
   * @deprecated Use remotePeers instead
   * Legacy array containing remote peers.
   * This property will be removed in future versions.
   */
  peers: PeerWithTracks<PeerMetadata, ServerMetadata>[];
};

/**
 * Hook allows to access id, tracks and metadata of the local and remote peers.
 *
 * @category Connection
 * @group Hooks
 * @typeParam PeerMetadata Type of metadata set by peer while connecting to a room.
 * @typeParam ServerMetadata Type of metadata set by the server while creating a peer.
 */
export function usePeers<
  PeerMetadata = Record<string, unknown>,
  ServerMetadata = Record<string, unknown>,
>(): UsePeersResult<PeerMetadata, ServerMetadata> {
  const { clientState } = useFishjamContext();

  const localPeer = clientState.localPeer
    ? getPeerWithDistinguishedTracks<PeerMetadata, ServerMetadata>(
        clientState.localPeer as BrandedPeer<PeerMetadata, ServerMetadata>,
      )
    : null;

  const remotePeers = Object.values(clientState.peers).map((peer) =>
    getPeerWithDistinguishedTracks<PeerMetadata, ServerMetadata>(peer as BrandedPeer<PeerMetadata, ServerMetadata>),
  );

  return { localPeer, remotePeers, peers: remotePeers };
}
