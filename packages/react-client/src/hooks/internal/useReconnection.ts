import type { ReconnectionStatus } from "@fishjam-cloud/ts-client";
import { useCallback, useContext, useSyncExternalStore } from "react";

import { FishjamClientContext } from "../../contexts/fishjamClient";

/**
 *
 * @category Connection
 */
export const useReconnection = (): ReconnectionStatus => {
  const fishjamClientRef = useContext(FishjamClientContext);
  if (!fishjamClientRef) throw Error("useConnection must be used within FishjamProvider");

  const client = fishjamClientRef.current;

  return useSyncExternalStore(
    client.subscribe,
    useCallback(() => client.getState().reconnectionStatus, [client]),
  );
};
