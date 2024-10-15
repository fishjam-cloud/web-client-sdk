import {
  useConnect,
  useInitializeDevices,
  useStatus,
} from "@fishjam-cloud/react-client";
import { useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export const useHandleConnection = () => {
  const navigate = useNavigate();
  const connect = useConnect();
  const [searchParams] = useSearchParams();
  const peerStatus = useStatus();
  const { initializeDevices } = useInitializeDevices();

  const fishjamUrl = searchParams.get("url");
  const peerToken = searchParams.get("token");
  const isPeerIdle = peerStatus === "idle";

  const handleConnection = useCallback(async () => {
    if (!isPeerIdle) return;
    if (!fishjamUrl || !peerToken) return navigate("/");
    await Promise.all([
      initializeDevices(),
      connect({ url: fishjamUrl, token: peerToken }),
    ]);
  }, [isPeerIdle, navigate, fishjamUrl, peerToken, initializeDevices]);

  useEffect(() => {
    handleConnection();
  }, [handleConnection]);
};
