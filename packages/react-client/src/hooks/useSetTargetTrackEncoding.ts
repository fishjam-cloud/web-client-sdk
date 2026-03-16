import type { Variant } from "@fishjam-cloud/ts-client";
import { useCallback, useContext } from "react";

import { FishjamClientContext } from "../contexts/fishjamClient";

/**
 * Hook provides a method to set the target encoding (simulcast variant) for a remote track.
 *
 * The encoding will be sent whenever it is available. If the chosen encoding is temporarily
 * unavailable, some other encoding will be sent until the chosen encoding becomes active again.
 *
 * @category Connection
 * @group Hooks
 */
export function useSetTargetTrackEncoding() {
  const fishjamClientRef = useContext(FishjamClientContext);
  if (!fishjamClientRef) throw Error("useSetTargetTrackEncoding must be used within FishjamProvider");

  const setTargetTrackEncoding = useCallback(
    (trackId: string, encoding: Variant) => {
      fishjamClientRef.current.setTargetTrackEncoding(trackId, encoding);
    },
    [fishjamClientRef],
  );

  return { setTargetTrackEncoding };
}
