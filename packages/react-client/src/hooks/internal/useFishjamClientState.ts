import type { Component, GenericMetadata } from "@fishjam-cloud/ts-client";
import type { ClientState, FishjamClient } from "@fishjam-cloud/tsunami";
import { useCallback, useRef, useSyncExternalStore } from "react";

import type { BrandedPeer } from "../../types/internal";
import type { PeerId } from "../../types/public";

export interface FishjamClientState<P = GenericMetadata, S = GenericMetadata> {
  peers: Record<PeerId, BrandedPeer<P, S>>;
  components: Record<string, Component>;
  localPeer: BrandedPeer<P, S> | null;
  isReconnecting: boolean;
}

/*
This is an internally used hook.
It is not meant to be used by the end user.
*/
export function useFishjamClientState<P, S>(fishjamClient: FishjamClient<P, S>): FishjamClientState<P, S> {
  const lastSnapshotRef = useRef<{ source: ClientState<P, S>; value: FishjamClientState<P, S> } | null>(null);

  const getSnapshot: () => FishjamClientState<P, S> = useCallback(() => {
    const source = fishjamClient.getState();
    if (lastSnapshotRef.current?.source !== source) {
      lastSnapshotRef.current = {
        source,
        value: {
          peers: source.remotePeers as Record<PeerId, BrandedPeer<P, S>>,
          components: source.components,
          localPeer: source.localPeer as BrandedPeer<P, S> | null,
          isReconnecting: source.reconnectionStatus === "reconnecting",
        },
      };
    }

    return lastSnapshotRef.current.value;
  }, [fishjamClient]);

  return useSyncExternalStore(fishjamClient.subscribe, getSnapshot);
}
