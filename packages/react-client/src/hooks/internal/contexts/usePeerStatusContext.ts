import { createContext, useContext } from "react";

import type { PeerStatus } from "../../../types/public";

export const PeerStatusContext = createContext<PeerStatus>("idle");

export function usePeerStatusContext() {
  const context = useContext(PeerStatusContext);
  return context;
}
