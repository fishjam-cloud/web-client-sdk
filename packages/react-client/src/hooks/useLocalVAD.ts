import type { GenericMetadata } from "@fishjam-cloud/ts-client";
import { useContext, useEffect, useState } from "react";

import { FishjamClientContext } from "../contexts/fishjamClient";
import type { BrandedPeer } from "../types/internal";
import type { PeerId } from "../types/public";

export const useLocalVAD = (
  localPeer: BrandedPeer<GenericMetadata, GenericMetadata> | null,
  showLocalPeer?: boolean,
): Record<PeerId, boolean> => {
  const fishjamClient = useContext(FishjamClientContext);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const microphoneTrack = localPeer
    ? Array.from(localPeer.tracks.values()).find(({ metadata }) => metadata?.type === "microphone")
    : undefined;

  useEffect(() => {
    if (!showLocalPeer || !localPeer) return;
    if (!microphoneTrack) return;
    // above -32 dBov -> speech, below -> silence, scaled to [0, 1] range gives us ~0.025 threshold
    const THRESHOLD = 0.025;
    const SILENCE_DEBOUNCE_TICKS = 2;
    let isSpeech = false;
    let silenceTicks = 0;
    const interval = setInterval(async () => {
      const trackAudio = await fishjamClient?.current?.getLocalTrackAudioLevel(microphoneTrack.trackId);
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
  }, [showLocalPeer, fishjamClient, microphoneTrack, localPeer]);

  if (!localPeer || !showLocalPeer) return {};
  return { [localPeer.id]: isSpeaking };
};
