import { Variant } from '@fishjam-cloud/protobufs/shared';
import { type BandwidthLimit } from './types';

export type Bitrate = number;
export type Bitrates = Record<Variant, Bitrate> | Bitrate;

// The suggested bitrate values are based on our internal tests.
export const defaultBitrates = {
  audio: 50_000 as Bitrate,
  video: 2_500_000 as Bitrate,
} as const;

export const UNLIMITED_BANDWIDTH: Bitrate = 0 as Bitrate;

// The suggested bitrate values are based on our internal tests.
export const defaultSimulcastBitrates: {
  [key in Variant]: BandwidthLimit;
} = {
  [Variant.VARIANT_HIGH]: 2_500_000,
  [Variant.VARIANT_MEDIUM]: 500_000,
  [Variant.VARIANT_LOW]: 150_000,
  [Variant.VARIANT_UNSPECIFIED]: 0,
  [Variant.UNRECOGNIZED]: 0,
};
