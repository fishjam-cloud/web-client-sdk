import type { UseConnect } from "../types";
import { useCallback } from "react";
import { useFishjamClient_DO_NOT_USE } from "./useFishjamClient";

export function useConnect(): UseConnect {
  const client = useFishjamClient_DO_NOT_USE();

  return useCallback((config) => client.connect(config), [client]);
}

export function useDisconnect() {
  const client = useFishjamClient_DO_NOT_USE();

  return useCallback(() => {
    client.disconnect();
  }, [client]);
}
