import type { FishjamClient } from "@fishjam-cloud/ts-client";
import { useEffect, useState } from "react";

import type { PeerStatus } from "../../types/public";

export const usePeerStatus = (client: FishjamClient) => {
  const [peerStatus, setPeerStatus] = useState<PeerStatus>("idle");

  useEffect(() => {
    const setConnecting = () => {
      setPeerStatus("connecting");
    };
    const setError = () => {
      setPeerStatus("error");
    };
    const setJoined = () => {
      setPeerStatus("connected");
    };
    const setDisconnected = () => {
      setPeerStatus("idle");
    };

    client.on("connectionStarted", setConnecting);
    client.on("reconnected", setJoined);
    client.on("joined", setJoined);
    client.on("authError", setError);
    client.on("joinError", setError);
    client.on("connectionError", setError);
    client.on("disconnected", setDisconnected);

    return () => {
      client.off("connectionStarted", setConnecting);
      client.off("reconnected", setJoined);
      client.off("joined", setJoined);
      client.off("authError", setError);
      client.off("joinError", setError);
      client.off("connectionError", setError);
      client.off("disconnected", setDisconnected);
    };
  }, [client, setPeerStatus]);

  return peerStatus;
};
