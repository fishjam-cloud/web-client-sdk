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
  metadata?: PeerMetadata;
  rawMetadata: Record<string, unknown>;
  metadataParsingError?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  tracks: Record<TrackId, Track>;
};

export type PeerStatus = "connecting" | "connected" | "authenticated" | "joined" | "error" | "closed" | null;
