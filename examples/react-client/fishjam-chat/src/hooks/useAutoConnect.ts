import { useConnection } from "@fishjam-cloud/react-client";
import { useCallback, useEffect } from "react";

import { getRoomCredentials } from "@/lib/roomManager";

export const useAutoConnect = () => {
  const { joinRoom, peerStatus } = useConnection();

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
      peerName,
    );
    await joinRoom({
      url,
      peerToken,
      peerMetadata: { displayName: peerName },
    });
  }, [isPeerIdle, roomName, peerName, roomManagerUrl, joinRoom]);

  useEffect(() => {
    handleConnection();
  }, [handleConnection]);
};
