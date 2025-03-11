import type { GenericMetadata } from "@fishjam-cloud/ts-client";
import { useCallback } from "react";

import { useFishjamContext } from "./internal/contexts/useFishjamContext";
import { useReconnection } from "./internal/useReconnection";
import { usePeerStatusContext } from "./internal/contexts/usePeerStatusContext";

export interface JoinRoomConfig<PeerMetadata extends GenericMetadata = GenericMetadata> {
  /**
   * Fishjam URL
   */
  url: string;
  /**
   * Token received from server (or Room Manager)
   */
  peerToken: string;
  /**
   * String indexed record with metadata, that will be available to all other peers
   */
  peerMetadata?: PeerMetadata;
}

/**
 * Hook allows to join or leave a room and check the current connection status.
 * @category Connection
 * @group Hooks
 */
export function useConnection() {
  const fishjamClientRef = useFishjamContext();
  const client = fishjamClientRef.current;

  const peerStatus = usePeerStatusContext();
  const reconnectionStatus = useReconnection();

  const joinRoom = useCallback(
    <PeerMetadata extends GenericMetadata = GenericMetadata>({
      url,
      peerToken,
      peerMetadata,
    }: JoinRoomConfig<PeerMetadata>) => client.connect({ url, token: peerToken, peerMetadata: peerMetadata ?? {} }),
    [client],
  );

  const leaveRoom = useCallback(() => {
    client.disconnect();
  }, [client]);

  return {
    /**
     * Join room and start streaming camera and microphone
     */
    joinRoom,
    /**
     * Leave room and stop streaming
     */
    leaveRoom,
    /**
     * Current peer connection status
     */
    peerStatus,
    /**
     * Current reconnection status
     */
    reconnectionStatus,
  };
}
