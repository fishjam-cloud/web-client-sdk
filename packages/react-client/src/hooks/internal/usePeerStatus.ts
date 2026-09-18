import type { FishjamClient } from "@fishjam-cloud/ts-client";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PeerStatus } from "../../types/public";

export const usePeerStatus = (client: FishjamClient) => {
  const [peerStatus, setPeerStatus] = useState<PeerStatus>("idle");
  const peerStatusRef = useRef<PeerStatus>("idle");
  const getLatestPeerStatus = useCallback(() => peerStatusRef.current, []);

  useEffect(() => {
    const updatePeerStatus = (status: PeerStatus) => {
      peerStatusRef.current = status;
      setPeerStatus(status);
    };
    const setConnecting = () => {
      updatePeerStatus("connecting");
    };
    const setError = () => {
      updatePeerStatus("error");
    };
    const setJoined = () => {
      updatePeerStatus("connected");
    };
    const setDisconnected = () => {
      updatePeerStatus("idle");
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
  }, [client]);

  return { peerStatus, getLatestPeerStatus };
};
