import type { FishjamClient } from "@fishjam-cloud/tsunami";
import { useCallback, useSyncExternalStore } from "react";

import type { PeerStatus } from "../../types/public";

export const usePeerStatus = (client: FishjamClient) => {
  // The store updates synchronously in the client event handlers, ahead of the re-render.
  const getLatestPeerStatus = useCallback((): PeerStatus => client.getState().peerStatus, [client]);
  const peerStatus = useSyncExternalStore(client.subscribe, getLatestPeerStatus);

  return { peerStatus, getLatestPeerStatus };
};
