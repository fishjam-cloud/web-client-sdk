import { JellyfishClient } from "@jellyfish-dev/ts-client-sdk";

import { useEffect } from "react";
import { showToastError } from "./Toasts";

export const useConnectionToasts = <P, T>(client: JellyfishClient<P, T> | null) => {
  useEffect(() => {
    if (!client) return;

    const onSocketError = () => {
      showToastError("Socket error occurred");
    };

    const onConnectionError = (message: string) => {
      showToastError(`Connection error occurred. ${message ?? ""}`);
    };

    const onJoinError = () => {
      showToastError("Failed to join the room");
    };

    const onAuthError = () => {
      showToastError("Failed to authenticate");
    };

    client.on("onSocketError", onSocketError);
    client.on("onConnectionError", onConnectionError);
    client.on("onJoinError", onJoinError);
    client.on("onAuthError", onAuthError);

    return () => {
      client.off("onSocketError", onSocketError);
      client.off("onConnectionError", onConnectionError);
      client.off("onJoinError", onJoinError);
      client.off("onAuthError", onAuthError);
    };
  }, [client]);
};
