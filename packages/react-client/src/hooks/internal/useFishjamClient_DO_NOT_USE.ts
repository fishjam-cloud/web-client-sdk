import { useContext, useMemo } from "react";

import { FishjamClientContext } from "../../contexts/fishjamClient";

/**
 *
 * @category Connection
 * @deprecated
 */
export function useFishjamClient_DO_NOT_USE() {
  const fishjamClientRef = useContext(FishjamClientContext);
  if (!fishjamClientRef) throw Error("useFishjamClient_DO_NOT_USE must be used within a FishjamProvider");
  return useMemo(() => fishjamClientRef.current, [fishjamClientRef]);
}
