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
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const ready = client.getDataPublisherReadiness();
    setReady(ready);

    const handleReady = () => {
      setReady(true);
      setError(null);
    };
    const handleDisconnect = () => {
      setReady(false);
      setLoading(loading);
    };

    client.on("dataPublisherReady", handleReady);
    client.on("disconnected", handleDisconnect);

    return () => {
      client.removeListener("dataPublisherReady", handleReady);
      client.removeListener("disconnected", handleDisconnect);
    };
  }, [client]);

  const initialize = useCallback(() => {
    if (loading || ready) return;

    if (peerStatus !== "connected") {
      setError(new Error("Peer is not connected"));
      return;
    }

    const createPublishers = async () => {
      try {
        setLoading(true);
        await client.createDataPublishers();
      } catch (err) {
        if (err instanceof Error) {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    };

    createPublishers();
  }, [client, peerStatus, loading, ready]);

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
    initialize,
    ready,
    loading,
    error,
  };
}
