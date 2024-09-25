import type { ConnectConfig, UseConnect } from "../types";
import { useCallback } from "react";
import { useFishjamContext } from "./useFishjamContext";

/**
 *
 * @category Connection
 */
export function useConnect(): UseConnect {
  const client = useFishjamContext().fishjamClientRef.current;

  return useCallback(
    (config: ConnectConfig) => client.connect({ ...config, peerMetadata: config.peerMetadata ?? {} }),
    [client],
  );
}

/**
 *
 * @category Connection
 */
export function useDisconnect() {
  const client = useFishjamContext().fishjamClientRef.current;

  return useCallback(() => {
    client.disconnect();
  }, [client]);
}
