import { useFishjamContext } from "./useFishjamContext";

export function useStatus() {
  const {
    peerStatusState: [peerStatus],
  } = useFishjamContext();

  return peerStatus;
}
