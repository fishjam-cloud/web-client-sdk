import { useEffect, useState } from "react";
import type { TrackManager } from "../types/internal";

export function useProcessedPreviewStream(
  trackManager: TrackManager,
  deviceTrack: MediaStreamTrack | null | undefined,
) {
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);

  const { currentTrack, currentTrackMiddleware } = trackManager;

  useEffect(() => {
    if (currentTrack || !deviceTrack) return;
    const result = currentTrackMiddleware?.(deviceTrack);
    if (result?.track) setPreviewStream(new MediaStream([result.track]));
    return () => {
      result?.onClear?.();
      setPreviewStream(null);
    };
  }, [currentTrack, deviceTrack, currentTrackMiddleware]);

  return previewStream;
}
