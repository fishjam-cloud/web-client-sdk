import { useCallback, useEffect, useRef, useState } from "react";
import type { ParticipantStatus } from "../state.types";
import type { FishjamClient } from "@fishjam-cloud/ts-client";
import type { PeerMetadata, TrackMetadata } from "../types";

export const useParticipantStatus = (client: FishjamClient<PeerMetadata, TrackMetadata>) => {
  const [peerStatus, setParticipantStatusState] = useState<ParticipantStatus>("idle");
  const peerStatusRef = useRef<ParticipantStatus>("idle");

  const setParticipantStatus = useCallback(
    (status: ParticipantStatus) => {
      peerStatusRef.current = status;
      setParticipantStatusState(status);
    },
    [setParticipantStatusState],
  );

  const getCurrentParticipantStatus = useCallback(() => peerStatusRef.current, []);

  useEffect(() => {
    const setConnecting = () => {
      setParticipantStatus("connecting");
    };
    const setError = () => {
      setParticipantStatus("error");
    };
    const setJoined = () => {
      setParticipantStatus("connected");
    };
    const setDisconnected = () => {
      setParticipantStatus("idle");
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
  }, [client, setParticipantStatus]);

  return { peerStatus, getCurrentParticipantStatus } as const;
};
