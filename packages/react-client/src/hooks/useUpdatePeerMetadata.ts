import type { GenericMetadata } from "@fishjam-cloud/ts-client";
import { useCallback } from "react";

import { useFishjamContext } from "./internal/useFishjamContext";

/**
 * Hook provides a method to update the metadata of the local peer.
 * @category Connection
 * @group Hooks
 * @returns
 */
export const useUpdatePeerMetadata = <PeerMetadata extends GenericMetadata = GenericMetadata>() => {
  const { fishjamClientRef } = useFishjamContext();

  const updatePeerMetadata = useCallback(
    (peerMetadata: PeerMetadata) => {
      fishjamClientRef.current.updatePeerMetadata(peerMetadata);
    },
    [fishjamClientRef],
  );

  return { updatePeerMetadata };
};
