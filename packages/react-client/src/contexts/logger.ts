import type { getLogger } from "@fishjam-cloud/ts-client";
import { createContext, useContext } from "react";

export const LoggerContext = createContext<ReturnType<typeof getLogger> | null>(null);

export const useLogger = () => {
  const logger = useContext(LoggerContext);
  if (logger == null) {
    throw new Error("Logger needs to be used within FishjamProvider");
  }
  return logger;
};
