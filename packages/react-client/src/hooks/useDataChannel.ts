import type { DataCallback, DataChannelOptions } from "@fishjam-cloud/ts-client";
import { useCallback, useContext, useSyncExternalStore } from "react";

import { FishjamClientContext } from "../contexts/fishjamClient";
import type { UseDataChannelResult } from "../types/public";

/**
 * Hook for managing data channels: initialization, publishing and subscribing to data.
 *
 * @category Connection
 * @group Hooks
 */
export function useDataChannel(): UseDataChannelResult {
  const fishjamClientRef = useContext(FishjamClientContext);
  if (!fishjamClientRef) throw Error("useDataPublisher must be used within FishjamProvider");
  const client = fishjamClientRef.current;

  const dataChannel = useSyncExternalStore(
    client.subscribe,
    useCallback(() => client.getState().dataChannel, [client]),
  );

  const initializeDataChannel = useCallback(() => {
    // Failures surface through the state slice, matching the hook's
    // historical non-throwing contract.
    void client.createDataChannels().catch(() => undefined);
  }, [client]);

  const publishData = useCallback(
    (payload: Uint8Array, options: DataChannelOptions) => {
      try {
        client.publishData(payload, options);
      } catch {
        // Mirrored into the state slice by the client.
      }
    },
    [client],
  );

  const subscribeData = useCallback(
    (callback: DataCallback, options: DataChannelOptions) => client.subscribeData(callback, options),
    [client],
  );

  return {
    initializeDataChannel,
    publishData,
    subscribeData,
    dataChannelReady: dataChannel.status === "ready",
    dataChannelLoading: dataChannel.status === "creating",
    dataChannelError: dataChannel.error,
  };
}
