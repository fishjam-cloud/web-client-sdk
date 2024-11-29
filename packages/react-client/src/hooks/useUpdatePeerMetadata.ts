import { useCallback } from "react";
import { useFishjamContext } from "./internal/useFishjamContext";
import type { GenericMetadata } from "@fishjam-cloud/ts-client";

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
