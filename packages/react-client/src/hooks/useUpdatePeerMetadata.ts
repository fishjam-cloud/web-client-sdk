import { useCallback } from "react";
import type { GenericMetadata } from "@fishjam-cloud/ts-client";
import { useFishjamContext } from "./internal/useFishjamContext";

export const useUpdatePeerMetadata = <PeerMetadata = GenericMetadata>() => {
  const { fishjamClientRef } = useFishjamContext();

  const updatePeerMetadata = useCallback(
    (peerMetadata: PeerMetadata) => {
      fishjamClientRef.current.updatePeerMetadata(peerMetadata as GenericMetadata);
    },
    [fishjamClientRef],
  );

  return { updatePeerMetadata };
};
