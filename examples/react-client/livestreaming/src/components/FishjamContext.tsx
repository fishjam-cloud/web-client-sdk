import { FishjamProvider } from "@fishjam-cloud/react-client";
import React, { type FC, type PropsWithChildren } from "react";

import { FishjamContext } from "@/lib/fishjamContext";

export const FishjamCtxProvider: FC<PropsWithChildren> = ({ children }) => {
  const [fishjamId, setFishjamId] = React.useState<string | undefined>(
    import.meta.env.VITE_FISHJAM_ID ?? null,
  );

  return (
    <FishjamContext.Provider value={{ fishjamId, setFishjamId }}>
      <FishjamProvider fishjamId={fishjamId}>{children}</FishjamProvider>
    </FishjamContext.Provider>
  );
};
