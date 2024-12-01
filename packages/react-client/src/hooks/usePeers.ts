import type { FishjamTrackContext, GenericMetadata, TrackContext, TrackMetadata } from "@fishjam-cloud/ts-client";
import type { Track, Peer } from "../types/public";
import { useFishjamContext } from "./internal/useFishjamContext";
import type { DistinguishedTracks, PeerState } from "../types/internal";

export type PeerWithTracks<
  PeerMetadata extends GenericMetadata = GenericMetadata,
  ServerMetadata extends GenericMetadata = GenericMetadata,
> = PeerState<PeerMetadata, ServerMetadata> & DistinguishedTracks;

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

function getPeerWithDistinguishedTracks<
  PeerMetadata extends GenericMetadata = GenericMetadata,
  ServerMetadata extends GenericMetadata = GenericMetadata,
>(peer: Peer<GenericMetadata, GenericMetadata>): PeerWithTracks<PeerMetadata, ServerMetadata> {
  const tracks = [...peer.tracks.values()].map(trackContextToTrack);

  const cameraTrack = tracks.find(({ metadata }) => metadata?.type === "camera");
  const microphoneTrack = tracks.find(({ metadata }) => metadata?.type === "microphone");
  const screenShareVideoTrack = tracks.find(({ metadata }) => metadata?.type === "screenShareVideo");
  const screenShareAudioTrack = tracks.find(({ metadata }) => metadata?.type === "screenShareAudio");

  return {
    id: peer.id,
    metadata: peer.metadata as Peer<PeerMetadata, ServerMetadata>["metadata"],
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
export type UsePeersResult<
  PeerMetadata extends GenericMetadata = GenericMetadata,
  ServerMetadata extends GenericMetadata = GenericMetadata,
> = {
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
 *
 * @category Connection
 *
 * @typeParam P Type of metadata set by peer while connecting to a room.
 * @typeParam S Type of metadata set by the server while creating a peer.
 */
export function usePeers<
  PeerMetadata extends GenericMetadata = GenericMetadata,
  ServerMetadata extends GenericMetadata = GenericMetadata,
>(): UsePeersResult<PeerMetadata, ServerMetadata> {
  const { clientState } = useFishjamContext();

  const localPeer = clientState.localPeer
    ? getPeerWithDistinguishedTracks<PeerMetadata, ServerMetadata>(clientState.localPeer)
    : null;

  const remotePeers = Object.values(clientState.peers).map((peer) =>
    getPeerWithDistinguishedTracks<PeerMetadata, ServerMetadata>(peer),
  );

  return { localPeer, remotePeers, peers: remotePeers };
}
