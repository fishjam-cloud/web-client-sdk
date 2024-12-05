import type { Component, FishjamClient, GenericMetadata, MessageEvents, Peer } from "@fishjam-cloud/ts-client";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import type { PeerId } from "../../types/internal";

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

export interface FishjamClientState<P = GenericMetadata, S = GenericMetadata> {
  peers: Record<PeerId, Peer<P, S>>;
  components: Record<string, Component>;
  localPeer: Peer<P, S> | null;
  isReconnecting: boolean;
}

/*
This is an internally used hook.
It is not meant to be used by the end user.
*/
export function useFishjamClientState<P, S>(fishjamClient: FishjamClient<P, S>): FishjamClientState<P, S> {
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

  const lastSnapshotRef = useRef<FishjamClientState<P, S> | null>(null);

  const getSnapshot: () => FishjamClientState<P, S> = useCallback(() => {
    if (mutationRef.current || lastSnapshotRef.current === null) {
      const peers = client.getRemotePeers();
      const components = client.getRemoteComponents();
      const localPeer = client.getLocalPeer();
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
