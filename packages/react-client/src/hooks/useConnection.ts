import type { GenericMetadata } from "@fishjam-cloud/ts-client";
import { useCallback, useContext } from "react";

import { ConnectUrlContext } from "../contexts/connect_url";
import { FishjamClientContext } from "../contexts/fishjamClient";
import { PeerStatusContext } from "../contexts/peerStatus";
import { useReconnection } from "./internal/useReconnection";

export interface JoinRoomConfig<PeerMetadata extends GenericMetadata = GenericMetadata> {
  /**
   * Fishjam URL
   */
  url?: string;
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
  const fishjamClientRef = useContext(FishjamClientContext);
  const fishjamId = useContext(ConnectUrlContext);
  if (!fishjamClientRef || !fishjamId) throw Error("useConnection must be used within FishjamProvider");

  const peerStatus = useContext(PeerStatusContext);

  const client = fishjamClientRef.current;
  const reconnectionStatus = useReconnection();

  const joinRoom = useCallback(
    <PeerMetadata extends GenericMetadata = GenericMetadata>({
      url,
      peerToken,
      peerMetadata,
    }: JoinRoomConfig<PeerMetadata>) => {
      const connectUrl = `wss://cloud-two.fishjam.ovh/api/v1/connect/${fishjamId}`;
      return client.connect({ url: url ?? connectUrl, token: peerToken, peerMetadata: peerMetadata ?? {} });
    },
    [client, fishjamId],
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
