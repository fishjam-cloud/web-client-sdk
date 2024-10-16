import { getRoomCredentials } from "@/lib/roomManager";
import {
  useConnect,
  useInitializeDevices,
  useStatus,
} from "@fishjam-cloud/react-client";
import { useCallback, useEffect } from "react";

export const useAutoConnect = () => {
  const connect = useConnect();
  const peerStatus = useStatus();
  const { initializeDevices } = useInitializeDevices();

  const qs = new URLSearchParams(window.location.search);

  const roomManagerUrl = qs.get("roomManagerUrl");
  const roomName = qs.get("roomName");
  const peerName = qs.get("peerName");
  const isPeerIdle = peerStatus === "idle";

  const handleConnection = useCallback(async () => {
    if (!isPeerIdle || !roomManagerUrl || !roomName || !peerName) return;
    const { url, peerToken } = await getRoomCredentials(
      roomManagerUrl,
      roomName,
      peerName
    );
    await connect({ url, token: peerToken });
  }, [isPeerIdle, roomName, peerName, roomManagerUrl, initializeDevices]);

  useEffect(() => {
    handleConnection();
  }, [handleConnection]);
};
