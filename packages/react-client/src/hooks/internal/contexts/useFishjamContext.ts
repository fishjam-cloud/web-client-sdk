import type { FishjamClient } from "@fishjam-cloud/ts-client";
import { createContext, type RefObject, useContext } from "react";

export const FishjamContext = createContext<RefObject<FishjamClient> | null>(null);

export function useFishjamContext() {
  const context = useContext(FishjamContext);
  if (!context) throw new Error("useFishjamContext must be used within a FishjamProvider");
  return context;
}
