import type { FishjamClient } from "@fishjam-cloud/tsunami";
import { useCallback, useSyncExternalStore } from "react";

import type { PeerStatus } from "../../types/public";

export const usePeerStatus = (client: FishjamClient): PeerStatus =>
  useSyncExternalStore(
    client.subscribe,
    useCallback(() => client.getState().peerStatus, [client]),
  );
