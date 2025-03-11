import type { ReconnectionStatus } from "@fishjam-cloud/ts-client";
import { useContext, useEffect, useState } from "react";

import { FishjamClientContext } from "../../contexts/fishjamClient";

/**
 *
 * @category Connection
 */
export const useReconnection = (): ReconnectionStatus => {
  const fishjamClientRef = useContext(FishjamClientContext);
  if (!fishjamClientRef) throw Error("useConnection must be used within FishjamProvider");

  const [reconnectionStatus, setReconnectionStatus] = useState<ReconnectionStatus>("idle");

  useEffect(() => {
    const client = fishjamClientRef.current;

    const setReconnecting = () => {
      setReconnectionStatus("reconnecting");
    };
    const setIdle = () => {
      setReconnectionStatus("idle");
    };
    const setError = () => {
      setReconnectionStatus("error");
    };

    client.on("reconnectionStarted", setReconnecting);
    client.on("reconnected", setIdle);
    client.on("reconnectionRetriesLimitReached", setError);

    return () => {
      client.off("reconnectionStarted", setReconnecting);
      client.off("reconnected", setIdle);
      client.off("reconnectionRetriesLimitReached", setError);
    };
  }, [fishjamClientRef]);

  return reconnectionStatus;
};
