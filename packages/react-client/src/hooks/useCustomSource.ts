import { useContext } from "react";

import { FishjamClientContext } from "../contexts/fishjamClient";
import { PeerStatusContext } from "../contexts/peerStatus";
import { useCustomSourceManager } from "./internal/useCustomSourceManager";

export type CustomSourceProps = {
  stream: MediaStream;
};

/**
 * This hook can register/deregister a custom MediaStream with Fishjam.
 * @group Hooks
 */
export function useCustomSource({ stream }: CustomSourceProps) {
  const fishjamClientRef = useContext(FishjamClientContext);
  if (!fishjamClientRef) throw Error("useCustomSource must be used within FishjamProvider");
  const peerStatus = useContext(PeerStatusContext);

  const customSourceManager = useCustomSourceManager({ fishjamClient: fishjamClientRef.current, stream, peerStatus });

  return {
    /**
     * Starts sending the stream to Fishjam.
     */
    startStreaming: customSourceManager.startStreaming,
    /**
     * Stops sending the stream to Fishjam.
     */
    stopStreaming: customSourceManager.stopStreaming,
    /**
     * The MediaStream object containing the current stream
     */
    stream,
  };
}
