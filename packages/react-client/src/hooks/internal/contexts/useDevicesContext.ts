import { createContext, useContext } from "react";

export const DevicesContext = createContext<(() => Promise<void>) | null>(null);

export function useDevicesContext() {
  const context = useContext(DevicesContext);
  if (!context) throw new Error("useDevicesContext must be used within a FishjamProvider");
  return context;
}
