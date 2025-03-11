import { createContext, useContext } from "react";

import type { UseScreenshareResult } from "../useScreenshareManager";

export const ScreenshareContext = createContext<UseScreenshareResult | null>(null);

export function useScreenshareContext() {
  const context = useContext(ScreenshareContext);
  if (!context) throw new Error("useScreenshareContext must be used within a FishjamProvider");
  return context as UseScreenshareResult;
}
