import type { ReconnectionStatus } from "@fishjam-cloud/ts-client";
import { useEffect, useState } from "react";

import { useFishjamContext } from "./useFishjamContext";

/**
 *
 * @category Connection
 */
export const useReconnection = (): ReconnectionStatus => {
  const { fishjamClientRef } = useFishjamContext();
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
