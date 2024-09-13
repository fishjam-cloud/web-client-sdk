import { useFishjamContext } from "./useFishjamContext";

export function useStatus() {
  return useFishjamContext().peerStatus;
}
