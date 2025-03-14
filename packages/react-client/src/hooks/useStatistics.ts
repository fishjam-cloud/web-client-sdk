import { useContext } from "react";

import { FishjamContext } from "./internal/useFishjamContext";

export const useStatistics = () => {
  const client = useContext(FishjamContext);
  if (!client) throw new Error("useStatistics must be used within a FishjamProvider");

  return {
    /*
     * Returns a low level RTCStatsReport statistics object about the connection.
     */
    getStatistics: client.fishjamClientRef.current.getStatistics,
  };
};
