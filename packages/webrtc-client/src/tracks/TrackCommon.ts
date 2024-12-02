import type { Variant } from '@fishjam-cloud/protobufs/shared';
import type { MLineId } from '../types';

export type TrackId = string;
export type EndpointId = string;

export type TrackEncodings = Record<Variant, boolean>;

export interface TrackCommon {
  mLineId: MLineId | null;
  encodings: TrackEncodings;
}
