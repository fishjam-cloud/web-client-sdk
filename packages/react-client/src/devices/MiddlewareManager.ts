import type { TrackMiddleware } from "../types/public";
import { setupOnEndedCallback } from "../utils/track";

export class MiddlewareManager {
  private middleware: TrackMiddleware | null = null;
  private clearMiddlewareFn: (() => void) | null = null;

  public getMiddleware(): TrackMiddleware | null {
    return this.middleware;
  }

  public clearMiddleware() {
    this.clearMiddlewareFn?.();
    this.clearMiddlewareFn = null;
  }

  public applyMiddleware(
    rawTrack: MediaStreamTrack | null,
    middleware: TrackMiddleware | null = this.middleware,
  ): MediaStreamTrack | null {
    this.middleware = middleware;
    this.clearMiddleware();
    if (!rawTrack || !middleware) return null;
    const { onClear, track } = middleware(rawTrack);

    if (onClear) this.clearMiddlewareFn = onClear;

    setupOnEndedCallback(
      track,
      () => track.id,
      async () => {
        this.clearMiddleware();
        track.stop();
      },
    );

    return track;
  }
}
