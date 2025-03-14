import { useCallback, useEffect, useRef, useState } from "react";

import type { TrackMiddleware } from "../../types/public";

export const useTrackMiddleware = (rawTrack: MediaStreamTrack | null) => {
  const [currentMiddleware, setMiddleware] = useState<TrackMiddleware>(null);
  const [processedTrack, setProcessedTrack] = useState<MediaStreamTrack | null>(null);
  const cleanupRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (!rawTrack && processedTrack) {
      processedTrack.stop();
      cleanupRef.current?.();
      setProcessedTrack(null);
    }
  }, [rawTrack, processedTrack]);

  const applyMiddleware = useCallback(
    (newMiddleware: TrackMiddleware) => {
      cleanupRef.current?.();
      setMiddleware(() => newMiddleware);

      if (newMiddleware && rawTrack) {
        const { track, onClear } = newMiddleware(rawTrack);
        cleanupRef.current = onClear;
        setProcessedTrack(track);
        return track;
      }

      setProcessedTrack(null);
      return rawTrack;
    },
    [rawTrack],
  );

  return { processedTrack, applyMiddleware, currentMiddleware };
};
