import type { Logger } from "@fishjam-cloud/ts-client";
import { useCallback, useEffect, useRef, useState } from "react";

import type { TrackMiddleware } from "../../types/public";

export type AppliedMiddleware = {
  track: MediaStreamTrack | null;
  /** Releases the middleware that was live before; call it once the new track is in use. */
  releasePrevious: () => void;
};

const noRelease = () => {};

export const useTrackMiddleware = (rawTrack: MediaStreamTrack | null, logger: Logger) => {
  const [currentMiddleware, setMiddleware] = useState<TrackMiddleware>(null);
  const [processedTrack, setProcessedTrack] = useState<MediaStreamTrack | null>(null);
  const cleanupRef = useRef<(() => void) | undefined>(undefined);
  // The raw track the middleware is currently applied to. Lets the re-apply effect below tell
  // "a new device track arrived" from "we just applied it ourselves".
  const appliedToRef = useRef<MediaStreamTrack | null>(null);
  // Bumped by every apply and every release. A middleware whose setup is still pending when the
  // next apply or release happens has no cleanup registered yet; the generation lets it notice,
  // once it resolves, that it was superseded and must release itself instead of becoming live.
  const applyGenerationRef = useRef(0);
  const latestApplyRef = useRef<Promise<MediaStreamTrack | null> | null>(null);

  // The single detach path: hands back the live middleware's onClear without running it, so the
  // caller decides when. Clearing the ref before returning makes a second detach a no-op — a
  // stopped device and an explicit setTrackMiddleware(null) can both land here for the same
  // middleware, and running a consumer's onClear twice tears down resources it no longer owns.
  const detachProcessedTrack = useCallback(() => {
    applyGenerationRef.current += 1;
    const onClear = cleanupRef.current;
    cleanupRef.current = undefined;
    appliedToRef.current = null;
    return onClear;
  }, []);

  const releaseProcessedTrack = useCallback(() => {
    detachProcessedTrack()?.();
  }, [detachProcessedTrack]);

  useEffect(() => {
    if (!rawTrack && processedTrack) {
      processedTrack.stop();
      releaseProcessedTrack();
      setProcessedTrack(null);
    }
  }, [rawTrack, processedTrack, releaseProcessedTrack]);

  // Takes the track explicitly. A caller that has just acquired a track must process *that*
  // track: `rawTrack` here still belongs to the previous device until React re-renders.
  const applyMiddleware = useCallback(
    async (newMiddleware: TrackMiddleware, track: MediaStreamTrack | null): Promise<AppliedMiddleware> => {
      // Detached now, released by the caller only once the new track is in use: a middleware's
      // onClear may dispose its track natively, and a published stream can only drop a track it
      // can still find.
      const previousOnClear = detachProcessedTrack();
      const releasePrevious = previousOnClear ?? noRelease;
      setMiddleware(() => newMiddleware);

      if (!newMiddleware || !track) {
        setProcessedTrack(null);
        latestApplyRef.current = Promise.resolve(track);
        return { track, releasePrevious };
      }

      // Claimed before awaiting: the re-render carrying this track can land while the middleware
      // is still setting up, and the re-apply effect would otherwise start a second one.
      appliedToRef.current = track;
      const generation = applyGenerationRef.current;
      const apply = (async (): Promise<MediaStreamTrack | null> => {
        try {
          const { track: middlewareTrack, onClear } = await newMiddleware(track);
          if (generation !== applyGenerationRef.current) {
            // Replaced or cleared while it was setting up. It never became the live track, so it
            // releases itself here, and its caller gets whatever superseded it.
            middlewareTrack.stop();
            onClear?.();
            return latestApplyRef.current ?? null;
          }
          cleanupRef.current = onClear;
          setProcessedTrack(middlewareTrack);
          return middlewareTrack;
        } catch (error) {
          if (generation === applyGenerationRef.current) {
            appliedToRef.current = null;
          }
          throw error;
        }
      })();
      latestApplyRef.current = apply;

      try {
        return { track: await apply, releasePrevious };
      } catch (error) {
        releasePrevious();
        throw error;
      }
    },
    [detachProcessedTrack],
  );

  // A middleware is set once, but the device track is replaced many times: camera off and on, a
  // camera switch, a track that ended. Without this the effect would silently vanish on the next
  // device track — and when the middleware is set before the camera starts, which is the usual
  // order for a hook, it would never be applied at all.
  useEffect(() => {
    if (!currentMiddleware || !rawTrack) return;
    if (appliedToRef.current === rawTrack) return;

    // Nothing is published from here, so the previous middleware can go right away.
    applyMiddleware(currentMiddleware, rawTrack)
      .then(({ releasePrevious }) => releasePrevious())
      .catch((error: unknown) => {
        logger.error(error);
      });
  }, [currentMiddleware, rawTrack, applyMiddleware, logger]);

  return { processedTrack, applyMiddleware, currentMiddleware };
};
