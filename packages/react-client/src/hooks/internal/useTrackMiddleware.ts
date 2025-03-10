import { useCallback, useRef, useState } from "react";

import type { TrackMiddleware } from "../../types/public";

export const useTrackMiddleware = (rawTrack: MediaStreamTrack | null) => {
  const [currentMiddleware, setMiddleware] = useState<TrackMiddleware>(null);
  const [processedTrack, setProcessedTrack] = useState<MediaStreamTrack | null>(null);
  const cleanupRef = useRef<(() => void) | undefined>(undefined);

  const applyMiddleware = useCallback(
    (newMiddleware: TrackMiddleware) => {
      cleanupRef.current?.();
      setMiddleware(newMiddleware);

      if (newMiddleware && rawTrack) {
        const { track, onClear } = newMiddleware(rawTrack);
        cleanupRef.current = onClear;
        setProcessedTrack(track);
        return track;
      }

      setProcessedTrack(null);
      return null;
    },
    [rawTrack],
  );

  return { processedTrack, applyMiddleware, currentMiddleware };
};
