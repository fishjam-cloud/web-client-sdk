import { useFishjamContext } from "./useFishjamContext";
import { useMemo } from "react";

/**
 *
 * @category Connection
 * @deprecated
 */
export function useFishjamClient_DO_NOT_USE() {
  const client = useFishjamContext().fishjamClientRef.current;

  return useMemo(() => client, [client]);
}
