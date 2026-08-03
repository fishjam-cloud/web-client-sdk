import type { SimulcastConfig, TrackBandwidthLimit, TrackMetadata } from "@fishjam-cloud/ts-client";

import type { PlatformMediaStreamTrack } from "../devices/deviceManager";

/**
 * Narrow signalling surface the device controllers publish through.
 *
 * Controllers never talk to the signalling client directly — the client hands
 * them this adapter, which also makes them trivially testable.
 */
export type TrackPublisher = {
  addTrack: (
    track: PlatformMediaStreamTrack,
    metadata: TrackMetadata,
    simulcastConfig?: SimulcastConfig,
    maxBandwidth?: TrackBandwidthLimit,
  ) => Promise<string>;
  replaceTrack: (trackId: string, newTrack: PlatformMediaStreamTrack | null) => Promise<void>;
  removeTrack: (trackId: string) => Promise<void>;
  updateTrackMetadata: (trackId: string, metadata: TrackMetadata) => void;
  getDisplayName: () => string | undefined;
  /** Resolves a local or remote track id to the current remote track id, if the track is still published. */
  resolveRemoteTrackId: (remoteOrLocalTrackId: string) => string | null;
  /** `true` while the signalling client exists and can publish tracks. */
  isSignallingActive: () => boolean;
  onJoined: (listener: () => void) => () => void;
  onDisconnected: (listener: () => void) => () => void;
};
