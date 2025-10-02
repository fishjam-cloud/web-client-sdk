import { FishjamProvider } from "@fishjam-cloud/react-client";
import React, { type FC, type PropsWithChildren } from "react";

import { DEFAULT_FISHJAM_ID } from "@/lib/consts";
import { FishjamContext } from "@/lib/fishjamContext";

export const FishjamCtxProvider: FC<PropsWithChildren> = ({ children }) => {
  const [fishjamId, setFishjamId] = React.useState<string>(DEFAULT_FISHJAM_ID);

  return (
    <FishjamContext.Provider value={{ fishjamId, setFishjamId }}>
      <FishjamProvider fishjamId={fishjamId}>{children}</FishjamProvider>
    </FishjamContext.Provider>
  );
};
