import type { ClientEvents } from "@fishjam-cloud/react-client";
import { create } from "@fishjam-cloud/react-client";
import { useEffect, useState } from "react";

export const {
  useStatus,
  useConnect,
  useDisconnect,
  FishjamContextProvider,
  useSetupMedia,
  useCamera,
  useMicrophone,
  useScreenShare,
  useSelector,
  useClient,
} = create();

export const useAuthErrorReason = () => {
  const client = useClient();
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const authError: ClientEvents["authError"] = (reason) => {
      setAuthError(reason);
    };

    const authSuccess: ClientEvents["authSuccess"] = () => {
      setAuthError(null);
    };

    client.on("authError", authError);
    client.on("authSuccess", authSuccess);

    return () => {
      client.removeListener("authError", authError);
      client.removeListener("authSuccess", authSuccess);
    };
  }, [setAuthError, client]);

  return authError;
};
