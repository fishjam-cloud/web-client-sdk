import type {
  Component,
  Endpoint,
  FishjamTrackContext,
  Metadata,
  Peer,
  TrackContext,
  TrackMetadata,
} from "@fishjam-cloud/ts-client";

import type { PeerId } from "../types/internal";
import type { Track } from "../types/public";
import { useFishjamContext } from "./internal/useFishjamContext";

/**
 *
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
    trackId: track.trackId,
    stream: track.stream,
    simulcastConfig: track.simulcastConfig ?? null,
    encoding: track.encoding ?? null,
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
 * Hook allows to access id, tracks and metadata of the local and remote peers.
 *
 * @category Connection
 * @group Hooks
 * @typeParam PeerMetadata Type of metadata set by peer while connecting to a room.
 * @typeParam ServerMetadata Type of metadata set by the server while creating a peer.
 */
export function usePeers<PeerMetadata = Record<string, unknown>, ServerMetadata = Record<string, unknown>>() {
  const { clientState } = useFishjamContext();

  const localPeer: PeerWithTracks<PeerMetadata, ServerMetadata> | null = clientState.localPeer
    ? getPeerWithDistinguishedTracks<PeerMetadata, ServerMetadata>(clientState.localPeer)
    : null;

  const remotePeers: PeerWithTracks<PeerMetadata, ServerMetadata>[] = Object.values(clientState.peers).map((peer) =>
    getPeerWithDistinguishedTracks<PeerMetadata, ServerMetadata>(peer),
  );

  return {
    /**
     * The local peer with distinguished tracks (camera, microphone, screen share).
     * Will be null if the local peer is not found.
     */ localPeer,
    /**
     * Array of remote peers with distinguished tracks (camera, microphone, screen share).
     */ remotePeers,
    /**
     * @deprecated Use remotePeers instead
     * Legacy array containing remote peers.
     * This property will be removed in future versions.
     */
    peers: remotePeers,
  };
}
