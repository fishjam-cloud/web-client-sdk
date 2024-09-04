import type { UseConnect } from "../types";
import { useCallback, useMemo } from "react";
import { useFishjamClient } from "./useFishjamClient";

export function useConnect(): UseConnect {
  const client = useFishjamClient();

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
  const client = useFishjamClient();

  return useCallback(() => {
    client.disconnect();
  }, [client]);
}
