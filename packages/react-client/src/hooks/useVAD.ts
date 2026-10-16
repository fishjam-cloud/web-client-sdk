import { useContext, useMemo, useSyncExternalStore } from "react";

import { FishjamClientContext } from "../contexts/fishjamClient";
import type { PeerId } from "../types/public";

/**
 * Hook that reports which of the requested peers are currently speaking.
 *
 * Remote peers are voice-activity-detected by the backend; the local peer is
 * detected by sampling the microphone's audio level.
 *
 * @category Connection
 * @group Hooks
 */
export function useVAD(options: { peerIds: ReadonlyArray<PeerId> }): Record<PeerId, boolean> {
  const fishjamClientRef = useContext(FishjamClientContext);
  if (!fishjamClientRef) throw Error("useVAD must be used within FishjamProvider");
  const client = fishjamClientRef.current;

  const voiceActivity = useSyncExternalStore(client.subscribeToVoiceActivity, client.getVoiceActivity);

  return useMemo(() => {
    const requested: Record<PeerId, boolean> = {};
    for (const peerId of options.peerIds) {
      if (peerId in voiceActivity) requested[peerId] = voiceActivity[peerId];
    }
    return requested;
  }, [voiceActivity, options.peerIds]);
}
