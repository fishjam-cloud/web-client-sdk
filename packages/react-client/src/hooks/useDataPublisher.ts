import type { DataCallback, DataChannelOptions } from "@fishjam-cloud/ts-client";
import { useCallback, useContext, useEffect, useState } from "react";

import { FishjamClientContext } from "../contexts/fishjamClient";
import { PeerStatusContext } from "../contexts/peerStatus";
import type { UseDataPublisherResult } from "../types/public";

/**
 * Hook for data publisher operations - publish and subscribe to data.
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
    const publisherReady = client.getDataPublisherReadiness();
    setReady(publisherReady);

    const handleReady = () => {
      setReady(true);
      setError(null);
    };
    const handleDisconnect = () => {
      setReady(false);
    };
    const handleError = (err: Error) => {
      setReady(false);
      setLoading(false);
      setError(err);
    };

    client.on("dataPublisherReady", handleReady);
    client.on("dataPublisherError", handleError);
    client.on("disconnected", handleDisconnect);

    return () => {
      client.removeListener("dataPublisherReady", handleReady);
      client.removeListener("disconnected", handleDisconnect);
    };
  }, [client]);

  const initialize = useCallback(async () => {
    if (loading || ready) return;

    if (peerStatus !== "connected") {
      setError(new Error("Peer is not connected"));
      return;
    }

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
    initializePublisher: initialize,
    publisherReady: ready,
    publisherLoading: loading,
    publisherError: error,
  };
}
