import { useFishjamContext } from "./useFishjamContext";

/**
 *
 * @category Connection
 */
export function useStatus() {
  return useFishjamContext().peerStatus;
}
