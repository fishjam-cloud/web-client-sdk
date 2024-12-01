import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type { Component, MessageEvents, FishjamClient, GenericMetadata } from "@fishjam-cloud/ts-client";
import type { PeerId, Peer } from "../../types/public";

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

export interface FishjamClientState<
  PeerMetadata extends GenericMetadata = GenericMetadata,
  ServerMetadata extends GenericMetadata = GenericMetadata,
> {
  peers: Record<PeerId, Peer<PeerMetadata, ServerMetadata>>;
  components: Record<string, Component>;
  localPeer: Peer<PeerMetadata, ServerMetadata> | null;
  isReconnecting: boolean;
}

/*
This is an internally used hook.
It is not meant to be used by the end user.
*/
export function useFishjamClientState<
  PeerMetadata extends GenericMetadata = GenericMetadata,
  ServerMetadata extends GenericMetadata = GenericMetadata,
>(fishjamClient: FishjamClient<PeerMetadata, ServerMetadata>): FishjamClientState<PeerMetadata, ServerMetadata> {
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

  const lastSnapshotRef = useRef<FishjamClientState<PeerMetadata, ServerMetadata> | null>(null);

  const getSnapshot: () => FishjamClientState<PeerMetadata, ServerMetadata> = useCallback(() => {
    if (mutationRef.current || lastSnapshotRef.current === null) {
      const peers = client.getRemotePeers() as Record<PeerId, Peer<PeerMetadata, ServerMetadata>>;
      const components = client.getRemoteComponents();
      const localPeer = client.getLocalPeer() as Peer<PeerMetadata, ServerMetadata>;
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
