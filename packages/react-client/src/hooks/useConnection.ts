import type { GenericMetadata } from "@fishjam-cloud/ts-client";
import { useCallback, useContext } from "react";

import { FishjamClientContext } from "../contexts/fishjamClient";
import { useFishjamId } from "../contexts/fishjamId";
import { PeerStatusContext } from "../contexts/peerStatus";
import { httpToWebsocketUrl, resolveFishjamUrl } from "../utils/fishjamUrl";
import { useReconnection } from "./internal/useReconnection";

export interface JoinRoomConfig<PeerMetadata extends GenericMetadata = GenericMetadata> {
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
  const fishjamId = useFishjamId();

  if (!fishjamClientRef) throw Error("useConnection must be used within FishjamProvider");

  const peerStatus = useContext(PeerStatusContext);

  const client = fishjamClientRef.current;
  const reconnectionStatus = useReconnection();

  const joinRoom = useCallback(
    <PeerMetadata extends GenericMetadata = GenericMetadata>({
      peerToken,
      peerMetadata,
    }: JoinRoomConfig<PeerMetadata>) => {
      if (!fishjamId) {
        throw Error(
          `You haven't passed your Fishjam ID to the FishjamProvider. You can get your Fishjam ID at https://fishjam.io/app`,
        );
      }
      const connectUrl = httpToWebsocketUrl(resolveFishjamUrl(fishjamId));
      return client.connect({ url: connectUrl, token: peerToken, peerMetadata: peerMetadata ?? {} });
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
