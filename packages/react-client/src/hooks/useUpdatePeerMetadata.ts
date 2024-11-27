import { useCallback } from "react";
import { useFishjamContext } from "./useFishjamContext";
import type { GenericMetadata } from "@fishjam-cloud/ts-client";

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
