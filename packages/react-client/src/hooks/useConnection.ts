import type { GenericMetadata, ReconnectionStatus } from "@fishjam-cloud/ts-client";
import { useCallback } from "react";

import type { PeerStatus } from "../types/public";
import { useFishjamContext } from "./internal/useFishjamContext";
import { useReconnection } from "./internal/useReconnection";

export interface JoinRoomConfig<PeerMetadata extends GenericMetadata = GenericMetadata> {
  /**
   * fishjam URL
   */
  url: string;
  /**
   * token received from server (or Room Manager)
   */
  peerToken: string;
  /**
   * string indexed record with metadata, that will be available to all other peers
   */
  peerMetadata?: PeerMetadata;
}

export interface UseConnectionResult {
  /**
   * Join room and start streaming camera and microphone
   *
   * See {@link JoinRoomConfig} for parameter list
   */
  joinRoom: <PeerMetadata extends GenericMetadata = GenericMetadata>(
    config: JoinRoomConfig<PeerMetadata>,
  ) => Promise<void>;
  /**
   * Leave room and stop streaming
   */
  leaveRoom: () => void;
  /**
   * Current peer connection status
   */
  peerStatus: PeerStatus;
  /**
   * Current reconnection status
   */
  reconnectionStatus: ReconnectionStatus;
}

/**
 * Hook allows to to join or leave a room and check the current connection status.
 * @category Connection
 * @returns
 */
export function useConnection() {
  const context = useFishjamContext();
  const client = context.fishjamClientRef.current;

  const reconnectionStatus = useReconnection();

  const joinRoom: UseConnectionResult["joinRoom"] = useCallback(
    ({ url, peerToken, peerMetadata }) => client.connect({ url, token: peerToken, peerMetadata: peerMetadata ?? {} }),
    [client],
  );

  const leaveRoom = useCallback(() => {
    client.disconnect();
  }, [client]);

  const peerStatus = context.peerStatus;

  return {
    joinRoom,
    leaveRoom,
    peerStatus,
    reconnectionStatus,
  };
}
