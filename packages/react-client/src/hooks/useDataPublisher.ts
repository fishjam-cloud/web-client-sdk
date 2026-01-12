import type { DataCallback, DataChannelOptions } from "@fishjam-cloud/ts-client";
import { useCallback, useContext, useEffect, useRef, useState } from "react";

import { FishjamClientContext } from "../contexts/fishjamClient";
import { PeerStatusContext } from "../contexts/peerStatus";
import type { UseDataPublisherResult } from "../types/public";

/**
 * Hook for data publisher operations - publish and subscribe to data.
 *
 * Automatically creates data publishers when called (unless already created
 * via `negotiateOnConnect` option in FishjamProvider).
 *
 * @category Connection
 * @group Hooks
 */
export function useDataPublisher(): UseDataPublisherResult {
  const fishjamClientRef = useContext(FishjamClientContext);
  const peerStatus = useContext(PeerStatusContext);

  if (!fishjamClientRef) throw Error("useDataPublisher must be used within FishjamProvider");

  const client = fishjamClientRef.current;
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const publishersCreatedRef = useRef(false);

  useEffect(() => {
    const connected = client.getDataPublisherReadiness();
    setIsConnected(connected);

    const handleReady = () => {
      setIsConnected(true);
      setError(null);
    };
    const handleDisconnect = () => {
      setIsConnected(false);
      publishersCreatedRef.current = false;
    };

    client.on("dataPublisherReady", handleReady);
    client.on("disconnected", handleDisconnect);

    return () => {
      client.removeListener("dataPublisherReady", handleReady);
      client.removeListener("disconnected", handleDisconnect);
    };
  }, [client]);

  // Auto-create publishers when peer is connected and hook is used
  useEffect(() => {
    if (peerStatus !== "connected") return;
    if (publishersCreatedRef.current) return;

    try {
      client.createDataPublishers();
      publishersCreatedRef.current = true;
    } catch (err) {
      // Publishers may already exist from negotiateOnConnect
      if (err instanceof Error) {
        setError(err);
      }
    }
  }, [client, peerStatus]);

  const publishData = useCallback(
    (data: Uint8Array, options: DataChannelOptions) => {
      try {
        client.publishData(data, options);
      } catch (err) {
        if (err instanceof Error) {
          setError(err);
        }
      }
    },
    [client],
  );

  const subscribeData = useCallback(
    (callback: DataCallback, options: DataChannelOptions): (() => void) => {
      return client.subscribeData(callback, options);
    },
    [client],
  );

  return {
    publishData,
    subscribeData,
    isConnected,
    error,
  };
}
