import type { UseConnect } from "../types";
import { useCallback, useMemo } from "react";
import { useFishjamClient_DO_NOT_USE } from "./useFishjamClient";

export function useConnect(): UseConnect {
  const client = useFishjamClient_DO_NOT_USE();

  return useMemo(() => {
    return (config) => {
      client.connect(config);
      return () => {
        client.disconnect();
      };
    };
  }, [client]);
}

export function useDisconnect() {
  const client = useFishjamClient_DO_NOT_USE();

  return useCallback(() => {
    client.disconnect();
  }, [client]);
}
