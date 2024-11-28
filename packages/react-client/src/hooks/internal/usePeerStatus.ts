import { useCallback, useEffect, useRef, useState } from "react";
import type { FishjamClient } from "@fishjam-cloud/ts-client";
import type { PeerStatus } from "../../types/public";

export const usePeerStatus = (client: FishjamClient) => {
  const [peerStatus, setPeerStatusState] = useState<PeerStatus>("idle");
  const peerStatusRef = useRef<PeerStatus>("idle");

  const setPeerStatus = useCallback(
    (status: PeerStatus) => {
      peerStatusRef.current = status;
      setPeerStatusState(status);
    },
    [setPeerStatusState],
  );

  const getCurrentPeerStatus = useCallback(() => peerStatusRef.current, []);

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
    client.on("joined", setJoined);
    client.on("authError", setError);
    client.on("joinError", setError);
    client.on("connectionError", setError);
    client.on("disconnected", setDisconnected);

    return () => {
      client.off("connectionStarted", setConnecting);
      client.off("joined", setJoined);
      client.off("authError", setError);
      client.off("joinError", setError);
      client.off("connectionError", setError);
      client.off("disconnected", setDisconnected);
    };
  }, [client, setPeerStatus]);

  return { peerStatus, getCurrentPeerStatus } as const;
};
