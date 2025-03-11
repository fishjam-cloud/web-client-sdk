import { useMemo } from "react";

import { useFishjamContext } from "./contexts/useFishjamContext";

/**
 *
 * @category Connection
 * @deprecated
 */
export function useFishjamClient_DO_NOT_USE() {
  const fishjamClientRef = useFishjamContext();

  return useMemo(() => fishjamClientRef.current, [fishjamClientRef]);
}
