import { useEffect, useState } from "react";
import { useFishjamContext } from "./useFishjamContext";
import type { ReconnectionStatus } from "@fishjam-cloud/ts-client";

export const useReconnection = (): ReconnectionStatus => {
  const { client } = useFishjamContext();
  const [reconnectionStatus, setReconnectionStatus] = useState<ReconnectionStatus>("idle");

  useEffect(() => {
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
  }, [client]);

  return reconnectionStatus;
};
