import type { Logger } from "@fishjam-cloud/ts-client";
import { useCallback, useEffect, useRef, useState } from "react";

import type { TrackMiddleware } from "../../types/public";

export type PublishTrack = (track: MediaStreamTrack | null) => Promise<void>;

type LiveMiddleware = { rawTrack: MediaStreamTrack; track: MediaStreamTrack; onClear?: () => void };

const release = (live: LiveMiddleware | null) => {
  if (!live) return;
  if (live.track !== live.rawTrack) live.track.stop();
  live.onClear?.();
};

export const useTrackMiddleware = (rawTrack: MediaStreamTrack | null, logger: Logger) => {
  const [currentMiddleware, setCurrentMiddleware] = useState<TrackMiddleware>(null);
  const [processedTrack, setProcessedTrack] = useState<MediaStreamTrack | null>(null);
  const liveRef = useRef<LiveMiddleware | null>(null);
  // The latest request. One that is replaced while it sets up releases itself instead of going live.
  const requestRef = useRef<{ track: MediaStreamTrack | null } | null>(null);

  const applyMiddleware = useCallback(
    async (middleware: TrackMiddleware, track: MediaStreamTrack | null, publish?: PublishTrack) => {
      const request = { track };
      requestRef.current = request;
      setCurrentMiddleware(() => middleware);

      const next = middleware && track ? { rawTrack: track, ...(await middleware(track)) } : null;
      if (requestRef.current !== request) return release(next);

      // Publish before releasing: releasing may dispose the old track, and a published stream can
      // only drop a track that still exists.
      await publish?.(next?.track ?? track);
      if (requestRef.current !== request) return release(next);

      const previous = liveRef.current;
      liveRef.current = next;
      setProcessedTrack(next?.track ?? null);
      release(previous);
    },
    [],
  );

  // Keeps the middleware on a new device track (camera off and on) and releases it when the device stops.
  useEffect(() => {
    if (!rawTrack) {
      if (requestRef.current?.track) requestRef.current = null;
      release(liveRef.current);
      liveRef.current = null;
      setProcessedTrack(null);
      return;
    }
    if (!currentMiddleware || requestRef.current?.track === rawTrack) return;
    applyMiddleware(currentMiddleware, rawTrack).catch((error: unknown) => logger.error(error));
  }, [rawTrack, currentMiddleware, applyMiddleware, logger]);

  return { processedTrack, applyMiddleware, currentMiddleware };
};
