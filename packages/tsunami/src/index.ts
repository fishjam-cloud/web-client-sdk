/**
 * TypeScript SDK core for Fishjam clients.
 *
 * @packageDocumentation
 */
export * from "@fishjam-cloud/ts-client";

export type MiddlewareResult = {
  track: MediaStreamTrack;
  onClear?: () => void;
};

export type TrackMiddleware = ((track: MediaStreamTrack) => MiddlewareResult | Promise<MiddlewareResult>) | null;
