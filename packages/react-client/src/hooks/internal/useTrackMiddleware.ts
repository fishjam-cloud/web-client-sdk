import type { Logger } from "@fishjam-cloud/ts-client";
import { useCallback, useEffect, useRef, useState } from "react";

import type { TrackMiddleware } from "../../types/public";

export type PublishTrack = (track: MediaStreamTrack | null) => Promise<void>;

type RunningMiddleware = {
  inputTrack: MediaStreamTrack;
  outputTrack: MediaStreamTrack;
  onClear?: () => void;
};

type MiddlewareRequest = { track: MediaStreamTrack | null };

const startMiddleware = async (
  middleware: TrackMiddleware,
  track: MediaStreamTrack | null,
): Promise<RunningMiddleware | null> => {
  if (!middleware || !track) return null;
  const { track: outputTrack, onClear } = await middleware(track);
  return { inputTrack: track, outputTrack, onClear };
};

const stopMiddleware = (running: RunningMiddleware | null) => {
  if (!running) return;
  const hasOwnTrack = running.outputTrack !== running.inputTrack;
  if (hasOwnTrack) running.outputTrack.stop();
  running.onClear?.();
};

export const useTrackMiddleware = (rawTrack: MediaStreamTrack | null, logger: Logger) => {
  const [currentMiddleware, setCurrentMiddleware] = useState<TrackMiddleware>(null);
  const [processedTrack, setProcessedTrack] = useState<MediaStreamTrack | null>(null);
  const runningMiddlewareRef = useRef<RunningMiddleware | null>(null);
  const latestRequestRef = useRef<MiddlewareRequest | null>(null);

  const applyMiddleware = useCallback(
    async (middleware: TrackMiddleware, track: MediaStreamTrack | null, publish?: PublishTrack) => {
      const request: MiddlewareRequest = { track };
      latestRequestRef.current = request;
      const isReplaced = () => latestRequestRef.current !== request;
      setCurrentMiddleware(() => middleware);

      const next = await startMiddleware(middleware, track);
      if (isReplaced()) {
        stopMiddleware(next);
        return;
      }

      // Publish first: stopping may dispose the old track while the stream still holds it.
      await publish?.(next?.outputTrack ?? track);
      if (isReplaced()) {
        stopMiddleware(next);
        return;
      }

      const previous = runningMiddlewareRef.current;
      runningMiddlewareRef.current = next;
      setProcessedTrack(next?.outputTrack ?? null);
      stopMiddleware(previous);
    },
    [],
  );

  useEffect(() => {
    const isDeviceStopped = !rawTrack;
    if (!isDeviceStopped) return;

    latestRequestRef.current = null;
    stopMiddleware(runningMiddlewareRef.current);
    runningMiddlewareRef.current = null;
    setProcessedTrack(null);
  }, [rawTrack]);

  useEffect(() => {
    const isAlreadyApplied = latestRequestRef.current?.track === rawTrack;
    if (!rawTrack || !currentMiddleware || isAlreadyApplied) return;

    applyMiddleware(currentMiddleware, rawTrack).catch((error: unknown) => logger.error(error));
  }, [rawTrack, currentMiddleware, applyMiddleware, logger]);

  return { processedTrack, applyMiddleware, currentMiddleware };
};
