import { FishjamProvider } from "@fishjam-cloud/react-client";
import React, { type FC, type PropsWithChildren } from "react";

import { FishjamContext } from "@/lib/fishjamContext";

const defaultFishjamId =
  new URLSearchParams(window.location.search).get("fishjamId") ??
  import.meta.env.VITE_FISHJAM_ID;

export const FishjamCtxProvider: FC<PropsWithChildren> = ({ children }) => {
  const [fishjamId, setFishjamId] = React.useState<string>(defaultFishjamId);

  return (
    <FishjamContext.Provider value={{ fishjamId, setFishjamId }}>
      <FishjamProvider fishjamId={fishjamId}>{children}</FishjamProvider>
    </FishjamContext.Provider>
  );
};
