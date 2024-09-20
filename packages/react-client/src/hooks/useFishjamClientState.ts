import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type { Component, Endpoint, MessageEvents, Peer, TrackContext, FishjamClient } from "@fishjam-cloud/ts-client";
import type { PeerMetadata, TrackMetadata } from "../types";
import type { PeerState, Track, TrackId } from "../state.types";

const eventNames = [
  "socketClose",
  "socketError",
  "socketOpen",
  "authSuccess",
  "authError",
  "disconnected",
  "reconnectionStarted",
  "reconnected",
  "reconnectionRetriesLimitReached",
  "joined",
  "joinError",
  "trackReady",
  "trackAdded",
  "trackRemoved",
  "trackUpdated",
  "peerJoined",
  "peerLeft",
  "peerUpdated",
  "componentAdded",
  "componentRemoved",
  "componentUpdated",
  "connectionError",
  "tracksPriorityChanged",
  "bandwidthEstimationChanged",
  "targetTrackEncodingRequested",
  "localTrackAdded",
  "localTrackRemoved",
  "localTrackReplaced",
  "localTrackMuted",
  "localTrackUnmuted",
  "localTrackBandwidthSet",
  "localTrackEncodingBandwidthSet",
  "localTrackEncodingEnabled",
  "localTrackEncodingDisabled",
  "localPeerMetadataChanged",
  "localTrackMetadataChanged",
  "disconnectRequested",
] as const satisfies (keyof MessageEvents<unknown, unknown>)[];

export interface FishjamClientState {
  peers: PeerState[];
  components: PeerState[];
  localPeer: PeerState | null;
  isReconnecting: boolean;
}

function trackContextToTrack(track: TrackContext<PeerMetadata, TrackMetadata>): Track {
  return {
    rawMetadata: track.rawMetadata,
    metadata: track.metadata,
    trackId: track.trackId,
    stream: track.stream,
    simulcastConfig: track.simulcastConfig ?? null,
    encoding: track.encoding ?? null,
    vadStatus: track.vadStatus,
    track: track.track,
    metadataParsingError: track.metadataParsingError,
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
    rawMetadata: peer.rawMetadata,
    metadata: peer.metadata,
    metadataParsingError: peer.metadataParsingError,
    id: peer.id,
    tracks,
  };
}

/*
This is an internally used hook.
It is not meant to be used by the end user.
*/
export function useFishjamClientState(fishjamClient: FishjamClient<PeerMetadata, TrackMetadata>): FishjamClientState {
  const client = useMemo(() => fishjamClient, [fishjamClient]);
  const mutationRef = useRef(false);

  const subscribe = useCallback(
    (subscribeCallback: () => void) => {
      const callback = () => {
        mutationRef.current = true;
        subscribeCallback();
      };
      eventNames.forEach((eventName) => client.on(eventName, callback));
      return () => {
        eventNames.forEach((eventName) => client.removeListener(eventName, callback));
      };
    },
    [client],
  );

  const lastSnapshotRef = useRef<FishjamClientState | null>(null);

  const getSnapshot: () => FishjamClientState = useCallback(() => {
    if (mutationRef.current || lastSnapshotRef.current === null) {
      const peers = Object.values(client.getRemotePeers()).map(endpointToPeerState);
      const components = Object.values(client.getRemoteComponents()).map(endpointToPeerState);
      const localEndpoint = client.getLocalPeer();
      const localPeer = localEndpoint ? endpointToPeerState(localEndpoint) : null;
      const isReconnecting = client.isReconnecting();

      lastSnapshotRef.current = {
        peers,
        components,
        localPeer,
        isReconnecting,
      };
      mutationRef.current = false;
    }

    return lastSnapshotRef.current;
  }, [client]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
