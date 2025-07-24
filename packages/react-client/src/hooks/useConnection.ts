import type { GenericMetadata } from "@fishjam-cloud/ts-client";
import { useCallback, useContext } from "react";

import { FISHJAM_WS_CONNECT_URL } from "../consts";
import { FishjamClientContext } from "../contexts/fishjamClient";
import { FishjamIdContext } from "../contexts/fishjamId";
import { PeerStatusContext } from "../contexts/peerStatus";
import { useReconnection } from "./internal/useReconnection";

export interface JoinRoomConfig<PeerMetadata extends GenericMetadata = GenericMetadata> {
  /**
   * Allows to override the default url derived from the Fishjam ID and the ID itself
   */
  configOverride?: { fishjamId?: string; fishjamUrl?: string };
  /**
   * @deprecated Overrides the default url derived from the Fishjam ID passed to FishjamProvider
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
  const fishjamId = useContext(FishjamIdContext);
  if (!fishjamClientRef) throw Error("useConnection must be used within FishjamProvider");

  const peerStatus = useContext(PeerStatusContext);

  const client = fishjamClientRef.current;
  const reconnectionStatus = useReconnection();

  const joinRoom = useCallback(
    <PeerMetadata extends GenericMetadata = GenericMetadata>({
      url,
      configOverride,
      peerToken,
      peerMetadata,
    }: JoinRoomConfig<PeerMetadata>) => {
      const resolvedFishjamId = configOverride?.fishjamId ?? fishjamId;
      const resolvedFishjamUrl = configOverride?.fishjamUrl ?? url;

      if (!resolvedFishjamUrl && !resolvedFishjamId) {
        throw Error(
          `You haven't passed your Fishjam ID to the FishjamProvider. You can get your Fishjam ID at https://fishjam.io/app`,
        );
      }

      const connectUrl = `${FISHJAM_WS_CONNECT_URL}/${resolvedFishjamId}`;
      return client.connect({
        url: resolvedFishjamUrl ?? connectUrl,
        token: peerToken,
        peerMetadata: peerMetadata ?? {},
      });
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
