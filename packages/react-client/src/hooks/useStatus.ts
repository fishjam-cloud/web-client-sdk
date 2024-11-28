import { useFishjamContext } from "./internal/useFishjamContext";

/**
 *
 * @category Connection
 */
export function useStatus() {
  return useFishjamContext().peerStatus;
}
