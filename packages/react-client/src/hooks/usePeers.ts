import type { Metadata, Variant } from "@fishjam-cloud/ts-client";
import { localPeerWithTracks, remotePeerWithTracks } from "@fishjam-cloud/tsunami";
import { useCallback, useContext } from "react";

import { FishjamClientContext } from "../contexts/fishjamClient";
import { FishjamClientStateContext } from "../contexts/fishjamState";
import type { PeerId, RemoteTrack, Track } from "../types/public";

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

  // The tsunami views are structurally identical to the public shapes; the
  // casts reintroduce the branded ids and DOM media types of the public API.
  const localPeer = clientState.localPeer
    ? (localPeerWithTracks(clientState.localPeer) as unknown as PeerWithTracks<PeerMetadata, ServerMetadata>)
    : null;

  const remotePeers = Object.values(clientState.peers).map(
    (peer) =>
      remotePeerWithTracks(peer, fishjamClient.current) as unknown as PeerWithTracks<
        PeerMetadata,
        ServerMetadata,
        RemoteTrack
      >,
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
