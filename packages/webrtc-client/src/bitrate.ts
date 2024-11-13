import type { Encoding } from './types';
import { type BandwidthLimit } from './types';

export type Bitrate = number;
export type Bitrates = Record<Encoding, Bitrate> | Bitrate;

// The suggested bitrate values are based on our internal tests.
export const defaultBitrates = {
  audio: 50_000 as Bitrate,
  video: 2_500_000 as Bitrate,
} as const;

export const UNLIMITED_BANDWIDTH: Bitrate = 0 as Bitrate;

// The suggested bitrate values are based on our internal tests.
export const defaultSimulcastBitrates: {
  [key in Encoding]: BandwidthLimit;
} = {
  h: 2_500_000,
  m: 500_000,
  l: 150_000,
};
