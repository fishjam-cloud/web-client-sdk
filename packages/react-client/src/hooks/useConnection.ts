import { useCallback } from "react";
import { useFishjamContext } from "./useFishjamContext";
import type { ConnectConfig } from "../types/public";

/**
 *
 * @category Connection
 */
export function useConnect(): (config: ConnectConfig) => Promise<void> {
  const client = useFishjamContext().fishjamClientRef.current;

  return useCallback((config) => client.connect({ ...config, peerMetadata: config.peerMetadata ?? {} }), [client]);
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
