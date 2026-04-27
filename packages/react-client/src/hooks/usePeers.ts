import type { FishjamClient, Metadata, Peer, SimulcastConfig, TrackMetadata, Variant } from "@fishjam-cloud/ts-client";
import { useCallback, useContext } from "react";

import { FishjamClientContext } from "../contexts/fishjamClient";
import { FishjamClientStateContext } from "../contexts/fishjamState";
import type { BrandedPeer } from "../types/internal";
import type { PeerId, RemoteTrack, Track, TrackId } from "../types/public";

/**
 *
 * @typeParam PeerMetadata Type of metadata set by peer while connecting to a room.
 * @typeParam ServerMetadata Type of metadata set by the server while creating a peer.
 */
export type PeerWithTracks<PeerMetadata, ServerMetadata, T extends Track = Track> = {
  id: PeerId;
  metadata?: Metadata<PeerMetadata, ServerMetadata>;
  tracks: T[];
  cameraTrack?: T;
  microphoneTrack?: T;
  screenShareVideoTrack?: T;
  screenShareAudioTrack?: T;
  customVideoTracks: T[];
  customAudioTracks: T[];
};

function trackContextToTrack(track: {
  metadata?: unknown;
  trackId: string;
  stream: MediaStream | null;
  simulcastConfig?: SimulcastConfig | null;
  track: MediaStreamTrack | null;
}): Track {
  return {
    metadata: track.metadata as TrackMetadata,
    trackId: track.trackId as TrackId,
    stream: track.stream,
    simulcastConfig: track.simulcastConfig ?? null,
    track: track.track,
  };
}

function trackContextToRemoteTrack(
  track: {
    metadata?: unknown;
    trackId: string;
    stream: MediaStream | null;
    simulcastConfig?: SimulcastConfig | null;
    track: MediaStreamTrack | null;
  },
  fishjamClient: FishjamClient,
): RemoteTrack {
  return {
    ...trackContextToTrack(track),
    setReceivedQuality: (encoding: Variant) => {
      fishjamClient.setTargetTrackEncoding(track.trackId, encoding);
    },
  };
}

function getLocalPeerWithTracks<P, S>(peer: BrandedPeer<P, S>): PeerWithTracks<P, S> {
  const tracks = [...peer.tracks.values()].map(trackContextToTrack);

  return {
    id: peer.id,
    metadata: peer.metadata as Peer<P, S>["metadata"],
    tracks,
    cameraTrack: tracks.find(({ metadata }) => metadata?.type === "camera"),
    microphoneTrack: tracks.find(({ metadata }) => metadata?.type === "microphone"),
    screenShareVideoTrack: tracks.find(({ metadata }) => metadata?.type === "screenShareVideo"),
    screenShareAudioTrack: tracks.find(({ metadata }) => metadata?.type === "screenShareAudio"),
    customVideoTracks: tracks.filter(({ metadata }) => metadata?.type === "customVideo"),
    customAudioTracks: tracks.filter(({ metadata }) => metadata?.type === "customAudio"),
  };
}

function getRemotePeerWithTracks<P, S>(
  peer: BrandedPeer<P, S>,
  fishjamClient: FishjamClient,
): PeerWithTracks<P, S, RemoteTrack> {
  const tracks = [...peer.tracks.values()].map((track) => trackContextToRemoteTrack(track, fishjamClient));

  return {
    id: peer.id,
    metadata: peer.metadata as Peer<P, S>["metadata"],
    tracks,
    cameraTrack: tracks.find(({ metadata }) => metadata?.type === "camera"),
    microphoneTrack: tracks.find(({ metadata }) => metadata?.type === "microphone"),
    screenShareVideoTrack: tracks.find(({ metadata }) => metadata?.type === "screenShareVideo"),
    screenShareAudioTrack: tracks.find(({ metadata }) => metadata?.type === "screenShareAudio"),
    customVideoTracks: tracks.filter(({ metadata }) => metadata?.type === "customVideo"),
    customAudioTracks: tracks.filter(({ metadata }) => metadata?.type === "customAudio"),
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
  const clientState = useContext(FishjamClientStateContext);
  const fishjamClient = useContext(FishjamClientContext);
  if (!clientState || !fishjamClient) throw Error("usePeers must be used within FishjamProvider");

  const localPeer: PeerWithTracks<PeerMetadata, ServerMetadata> | null = clientState.localPeer
    ? getLocalPeerWithTracks<PeerMetadata, ServerMetadata>(
        clientState.localPeer as BrandedPeer<PeerMetadata, ServerMetadata>,
      )
    : null;

  const remotePeers: PeerWithTracks<PeerMetadata, ServerMetadata, RemoteTrack>[] = Object.values(clientState.peers).map(
    (peer) =>
      getRemotePeerWithTracks<PeerMetadata, ServerMetadata>(
        peer as BrandedPeer<PeerMetadata, ServerMetadata>,
        fishjamClient.current,
      ),
  );

  const setReceivedTracksQuality = useCallback(
    (trackIds: string[], quality: Variant) =>
      trackIds.forEach((trackId) => fishjamClient.current.setTargetTrackEncoding(trackId, quality)),
    [fishjamClient],
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
    /**
     * This function allows to set the quality of tracks received from remote peers.
     * @param trackIds The array of the track ids to set the quality for.
     * @param quality The quality to set for the track.
     */
    setReceivedTracksQuality,
  };
}
