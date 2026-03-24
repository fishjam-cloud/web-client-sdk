import { useContext, useEffect, useState } from "react";

import { FishjamClientContext } from "../contexts/fishjamClient";
import type { PeerId } from "../types/public";
import { usePeers } from "./usePeers";

/**
 * Client-side voice activity detection for the local peer.
 *
 * Polls the local microphone's audio level every 100ms and derives a speech/silence
 * state from it. A level above ~0.025 (approximately −32 dBov, scaled to [0, 1])
 * is treated as speech. Silence is debounced over 2 consecutive ticks (~200ms)
 * to prevent rapid flapping.
 *
 * This is purely client-side — it does not signal other peers. Remote participants
 * receive the local peer's VAD status via backend `vadNotification` messages.
 *
 * @internal Used by `useVAD` when the local peer's id is included in `peerIds`.
 * @returns A record mapping the local peer's id to its current speaking state,
 * or an empty object if `showLocalPeer` is false or no microphone track is found.
 */
export const useLocalVAD = (showLocalPeer: boolean): Record<PeerId, boolean> => {
  const fishjamClient = useContext(FishjamClientContext);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const { localPeer } = usePeers();
  const localPeerId = localPeer?.id;
  const microphoneTrackId = localPeer?.microphoneTrack?.trackId;

  useEffect(() => {
    if (!showLocalPeer || !localPeerId || !microphoneTrackId) return;
    // above -32 dBov -> speech, below -> silence, scaled to [0, 1] range gives us 0.025 threshold
    const THRESHOLD = 0.025;
    const SILENCE_DEBOUNCE_TICKS = 2;
    let isSpeech = false;
    let silenceTicks = 0;
    const interval = setInterval(async () => {
      const trackAudio = await fishjamClient?.current?.getLocalTrackAudioLevel(microphoneTrackId);
      if (trackAudio == null) return;
      if (trackAudio.level > THRESHOLD) {
        silenceTicks = 0;
        if (!isSpeech) {
          isSpeech = true;
          setIsSpeaking(true);
        }
      } else {
        silenceTicks += 1;
        if (silenceTicks >= SILENCE_DEBOUNCE_TICKS && isSpeech) {
          isSpeech = false;
          setIsSpeaking(false);
        }
      }
    }, 100);

    return () => {
      clearInterval(interval);
      setIsSpeaking(false);
    };
  }, [showLocalPeer, fishjamClient, localPeerId, microphoneTrackId]);

  if (!localPeerId || !showLocalPeer) return {};
  return { [localPeerId]: isSpeaking };
};
