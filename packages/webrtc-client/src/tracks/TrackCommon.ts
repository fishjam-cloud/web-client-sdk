import type { MLineId, Encoding } from '../types';

export type TrackId = string;
export type EndpointId = string;

export type TrackEncodings = Record<Encoding, boolean>;

export interface TrackCommon {
  mLineId: MLineId | null;
  encodings: TrackEncodings;
}
