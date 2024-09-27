import type { Encoding, VadStatus, SimulcastConfig } from "@fishjam-cloud/ts-client";
import type { PeerMetadata, TrackMetadata } from "./types";

export type TrackId = string;
export type PeerId = string;

export type Track = {
  stream: MediaStream | null;
  encoding: Encoding | null;
  trackId: TrackId;
  metadata?: TrackMetadata;
  rawMetadata: Record<string, unknown>;
  metadataParsingError?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  simulcastConfig: SimulcastConfig | null;
  vadStatus: VadStatus;
  track: MediaStreamTrack | null;
};

export interface Origin {
  id: string;
  type: string;
  metadata?: PeerMetadata;
  rawMetadata: Record<string, unknown>;
  metadataParsingError?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export type TrackWithOrigin = Track & {
  origin: Origin;
};

export type PeerState = {
  id: PeerId;
  metadata: {
    peer?: PeerMetadata;
    server: Record<string, unknown>;
  };
  rawMetadata: Record<string, unknown>;
  metadataParsingError?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  tracks: Record<TrackId, Track>;
};

/**
 * Represents the possible statuses of a peer connection.
 *
 * idle - Participant is not connected, either never connected or successfully disconnected.
 * connecting - Participant is in the process of connecting.
 * connected - Participant has successfully connected.
 * error - There was an error in the connection process.
 */
export type ParticipantStatus = "connecting" | "connected" | "error" | "idle";
