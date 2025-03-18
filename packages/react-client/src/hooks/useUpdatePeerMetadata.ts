import type { GenericMetadata } from "@fishjam-cloud/ts-client";
import { useCallback, useContext } from "react";

import { FishjamClientContext } from "../contexts/fishjamClient";

/**
 * Hook provides a method to update the metadata of the local peer.
 * @category Connection
 * @group Hooks
 * @returns
 */
export const useUpdatePeerMetadata = <PeerMetadata extends GenericMetadata = GenericMetadata>() => {
  const fishjamClientRef = useContext(FishjamClientContext);
  if (!fishjamClientRef) throw Error("useUpdatePeerMetadata must be used within FishjamProvider");

  const updatePeerMetadata = useCallback(
    (peerMetadata: PeerMetadata) => {
      fishjamClientRef.current.updatePeerMetadata(peerMetadata);
    },
    [fishjamClientRef],
  );

  return {
    /**
     * Updates metadata visible to other peers
     */
    updatePeerMetadata,
  };
};
