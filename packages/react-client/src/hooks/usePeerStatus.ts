import { useEffect, useState } from "react";
import type { PeerStatus } from "../state.types";
import type { FishjamClient } from "@fishjam-cloud/ts-client";
import type { PeerMetadata, TrackMetadata } from "../types";

export const usePeerStatus = (client: FishjamClient<PeerMetadata, TrackMetadata>) => {
  const [peerStatus, setPeerStatus] = useState<PeerStatus>(null);

  useEffect(() => {
    const setAuthenticated = () => {
      setPeerStatus("authenticated");
    };
    const setError = () => {
      setPeerStatus("error");
    };
    const setJoined = () => {
      setPeerStatus("joined");
    };
    const setDisconnected = () => {
      setPeerStatus(null);
    };
    const setConnected = () => {
      setPeerStatus("connected");
    };
    client.on("authSuccess", setAuthenticated);
    client.on("joined", setJoined);
    client.on("authError", setError);
    client.on("joinError", setError);
    client.on("connectionError", setError);
    client.on("disconnected", setDisconnected);
    client.on("socketOpen", setConnected);

    return () => {
      client.off("authSuccess", setAuthenticated);
      client.off("joined", setJoined);
      client.off("authError", setError);
      client.off("joinError", setError);
      client.off("connectionError", setError);
      client.off("disconnected", setDisconnected);
      client.off("socketOpen", setConnected);
    };
  }, [client]);

  return [peerStatus, setPeerStatus] as const;
};
