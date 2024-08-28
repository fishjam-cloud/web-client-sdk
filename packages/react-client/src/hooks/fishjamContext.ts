import { createContext, useContext } from "react";
import type { FishjamContextType } from "../types";

export const FishjamContext = createContext<FishjamContextType | null>(null);

export function useFishjamContext() {
  const context = useContext(FishjamContext);
  if (!context) throw new Error("useFishjamContext must be used within a FishjamContextProvider");
  return context as FishjamContextType;
}
