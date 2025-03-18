import { useContext } from "react";

import { FishjamClientContext } from "../contexts/fishjamClient";

export const useStatistics = () => {
  const client = useContext(FishjamClientContext);
  if (!client) throw new Error("useStatistics must be used within a FishjamProvider");

  return {
    /*
     * Returns a low level RTCStatsReport statistics object about the connection.
     */
    getStatistics: () => client.current.getStatistics(),
  };
};
