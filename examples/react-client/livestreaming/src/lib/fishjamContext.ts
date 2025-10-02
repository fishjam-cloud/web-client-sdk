import React from "react";

export const FishjamContext = React.createContext<{
  fishjamId: string;
  setFishjamId: (id: string) => void;
} | null>(null);

export const useFishjamId = () => {
  const context = React.useContext(FishjamContext);
  if (!context) {
    throw new Error("useSetFishjamId must be used within a FishjamCtxProvider");
  }
  return context;
};
