import { useFishjamContext } from "./fishjamContext";
import type { FishjamContextType, UseConnect } from "../types";
import { useCallback, useMemo } from "react";
import type { UseReconnection } from "../state.types";

export function useConnect(): UseConnect {
  const { state }: FishjamContextType = useFishjamContext();

  return useMemo(() => {
    return (config) => {
      state.client.connect(config);
      return () => {
        state.client.disconnect();
      };
    };
  }, [state.client]);
}

export function useDisconnect() {
  const { state } = useFishjamContext();

  return useCallback(() => {
    state.client.disconnect();
  }, [state.client]);
}

export function useReconnection(): UseReconnection {
  const { state } = useFishjamContext();

  return {
    status: state.reconnectionStatus,
    isReconnecting: state.reconnectionStatus === "reconnecting",
    isError: state.reconnectionStatus === "error",
    isIdle: state.reconnectionStatus === "idle",
  };
}
