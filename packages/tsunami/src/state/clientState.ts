import type { Component, GenericMetadata, Peer, ReconnectionStatus } from "@fishjam-cloud/ts-client";

import type { DeviceItem, PlatformMediaStream, PlatformMediaStreamTrack } from "../devices/deviceManager";
import type { TrackMiddleware } from "../mediaTypes";

/**
 * Represents the possible statuses of a peer connection.
 *
 * - `idle` - Peer is not connected, either never connected or successfully disconnected.
 * - `connecting` - Peer is in the process of connecting.
 * - `connected` - Peer has successfully connected.
 * - `error` - There was an error in the connection process.
 */
export type PeerStatus = "connecting" | "connected" | "error" | "idle";

export interface LocalDeviceState {
  /** Track ready to be rendered or published (post-middleware when one is set). */
  track: PlatformMediaStreamTrack | null;
  stream: PlatformMediaStream | null;
  /** Soft mute flag — `false` while the track is disabled but the device stays on. */
  isEnabled: boolean;
  /** Device backing the current track. */
  activeDevice: DeviceItem | null;
  /** Device that will be used on the next start. */
  selectedDevice: DeviceItem | null;
  middleware: TrackMiddleware;
}

/**
 * Flat, synchronously readable snapshot of the client's observable state.
 *
 * Snapshots use structural sharing: an update replaces only the slices it
 * touched, so consumers can detect unchanged slices by reference equality.
 */
export interface ClientState<PeerMetadata = GenericMetadata, ServerMetadata = GenericMetadata> {
  // connection
  peerStatus: PeerStatus;
  reconnectionStatus: ReconnectionStatus;

  // participants
  localPeer: Peer<PeerMetadata, ServerMetadata> | null;
  remotePeers: Record<string, Peer<PeerMetadata, ServerMetadata>>;
  components: Record<string, Component>;
}

export const createInitialClientState = <PeerMetadata, ServerMetadata>(): ClientState<
  PeerMetadata,
  ServerMetadata
> => ({
  peerStatus: "idle",
  reconnectionStatus: "idle",
  localPeer: null,
  remotePeers: {},
  components: {},
});
