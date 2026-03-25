import { useContext, useEffect, useState } from "react";

import { FishjamClientContext } from "../contexts/fishjamClient";
import type { PeerId } from "../types/public";
import { usePeers } from "./usePeers";

// This is a dBov-to-linear conversion. -32 dBov number is taken from backend VAD threshold
// formula for dBov to linear conversion: linear = 10 ^ (dBov / 20)
// So -32 dBov = 10^(-32/20) ≈ 0.025. This is the minimum audio level considered "speech".
const THRESHOLD = 10 ** (-32 / 20);

// Number of consecutive "silence" ticks before we consider speech to have stopped. Helps with smoothing out brief pauses in speech.
const SILENCE_DEBOUNCE_TICKS = 2;

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
 * or an empty object if `options.disabled` is true, the local peer is not available, or no microphone track is found.
 */
export const useLocalVAD = (options: { disabled: boolean }): Record<PeerId, boolean> => {
  const fishjamClient = useContext(FishjamClientContext);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const { localPeer } = usePeers();
  const localPeerId = localPeer?.id;
  const microphoneTrackId = localPeer?.microphoneTrack?.trackId;

  useEffect(() => {
    if (options.disabled || !localPeerId || !microphoneTrackId) return;

    let silenceTicks = 0;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      const trackAudio = await fishjamClient?.current?.getLocalTrackAudioLevel(microphoneTrackId);
      if (trackAudio != null && trackAudio.level > THRESHOLD) {
        silenceTicks = 0;
        setIsSpeaking(true);
      } else {
        silenceTicks += 1;
        if (silenceTicks >= SILENCE_DEBOUNCE_TICKS) {
          setIsSpeaking(false);
        }
      }

      timeoutId = setTimeout(poll, 100);
    };

    timeoutId = setTimeout(poll, 0);

    return () => {
      clearTimeout(timeoutId);
      setIsSpeaking(false);
    };
  }, [options.disabled, fishjamClient, localPeerId, microphoneTrackId]);

  if (!localPeerId || options.disabled || !microphoneTrackId) return {};
  return { [localPeerId]: isSpeaking };
};
