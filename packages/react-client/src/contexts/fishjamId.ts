import { createContext, useContext } from "react";

export const FishjamIdContext = createContext<string | null>(null);

export const useFishjamId = () => {
  const fishjamId = useContext(FishjamIdContext);
  if (!fishjamId) {
    throw Error(
      `You haven't passed your Fishjam ID to the FishjamProvider. You can get your Fishjam ID at https://fishjam.io/app`,
    );
  }
  return fishjamId;
};
