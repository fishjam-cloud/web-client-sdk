import type { Logger } from "@fishjam-cloud/ts-client";
import { useCallback, useEffect, useRef, useState } from "react";

import type { TrackMiddleware } from "../../types/public";

export const useTrackMiddleware = (rawTrack: MediaStreamTrack | null, logger: Logger) => {
  const [currentMiddleware, setMiddleware] = useState<TrackMiddleware>(null);
  const [processedTrack, setProcessedTrack] = useState<MediaStreamTrack | null>(null);
  const cleanupRef = useRef<(() => void) | undefined>(undefined);
  // The raw track the middleware is currently applied to. Lets the re-apply effect below tell
  // "a new device track arrived" from "we just applied it ourselves".
  const appliedToRef = useRef<MediaStreamTrack | null>(null);

  // The single release path. Clearing the ref before calling makes a second release a no-op —
  // a stopped device and an explicit setTrackMiddleware(null) can both land here for the same
  // middleware, and running a consumer's onClear twice tears down resources it no longer owns.
  const releaseProcessedTrack = useCallback(() => {
    const onClear = cleanupRef.current;
    cleanupRef.current = undefined;
    appliedToRef.current = null;
    onClear?.();
  }, []);

  useEffect(() => {
    if (!rawTrack && processedTrack) {
      processedTrack.stop();
      releaseProcessedTrack();
      setProcessedTrack(null);
    }
  }, [rawTrack, processedTrack, releaseProcessedTrack]);

  // Takes the track explicitly. A caller that has just acquired a track must process *that*
  // track: `rawTrack` here still belongs to the previous device until React re-renders, so
  // closing over it would apply the middleware to the track being replaced.
  const applyMiddlewareToTrack = useCallback(
    async (newMiddleware: TrackMiddleware, track: MediaStreamTrack | null) => {
      releaseProcessedTrack();
      setMiddleware(() => newMiddleware);

      if (!newMiddleware || !track) {
        setProcessedTrack(null);
        return track;
      }

      // Claimed before awaiting: the re-render carrying this track can land while the middleware
      // is still setting up, and the re-apply effect would otherwise start a second one.
      appliedToRef.current = track;
      try {
        const { track: middlewareTrack, onClear } = await newMiddleware(track);
        cleanupRef.current = onClear;
        setProcessedTrack(middlewareTrack);
        return middlewareTrack;
      } catch (error) {
        appliedToRef.current = null;
        throw error;
      }
    },
    [releaseProcessedTrack],
  );

  const applyMiddleware = useCallback(
    (newMiddleware: TrackMiddleware) => applyMiddlewareToTrack(newMiddleware, rawTrack),
    [applyMiddlewareToTrack, rawTrack],
  );

  // A middleware is set once, but the device track is replaced many times: camera off and on, a
  // camera switch, a track that ended. Without this the effect would silently vanish on the next
  // device track — and when the middleware is set before the camera starts, which is the usual
  // order for a hook, it would never be applied at all.
  useEffect(() => {
    if (!currentMiddleware || !rawTrack) return;
    if (appliedToRef.current === rawTrack) return;

    applyMiddlewareToTrack(currentMiddleware, rawTrack).catch((error: unknown) => {
      logger.error(error);
    });
  }, [currentMiddleware, rawTrack, applyMiddlewareToTrack, logger]);

  return { processedTrack, applyMiddleware, applyMiddlewareToTrack, currentMiddleware };
};
