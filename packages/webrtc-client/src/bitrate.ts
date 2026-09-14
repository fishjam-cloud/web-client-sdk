import { Variant } from '@fishjam-cloud/protobufs/shared';

import { type BandwidthLimit, type Logger, type SimulcastBandwidthLimit, type TrackBandwidthLimit } from './types';

export type Bitrate = number;
export type Bitrates = Record<Variant, Bitrate> | Bitrate;

/**
 * Hard caps (in kbps) for the bitrate of an outgoing video track.
 * A limit passed to the SDK is never allowed to exceed these values, and an unset (0) limit resolves to them.
 */
export const MAX_BANDWIDTH_LIMITS = {
  singleStream: 1500 as BandwidthLimit,
  simulcast: {
    [Variant.VARIANT_LOW]: 150 as BandwidthLimit,
    [Variant.VARIANT_MEDIUM]: 500 as BandwidthLimit,
    [Variant.VARIANT_HIGH]: 1500 as BandwidthLimit,
  },
} as const;

const SIMULCAST_VARIANTS = [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH] as const;

type SimulcastVariant = (typeof SIMULCAST_VARIANTS)[number];

const isSimulcastVariant = (variant: Variant): variant is SimulcastVariant =>
  (SIMULCAST_VARIANTS as readonly Variant[]).includes(variant);

const resolveAgainstCap = (
  limit: BandwidthLimit | undefined,
  cap: BandwidthLimit,
  label: string,
  logger: Logger,
): BandwidthLimit => {
  if (!limit || limit <= 0) return cap;
  if (limit > cap) {
    logger.warn(`Desired ${label} bandwidth of ${limit} kbps exceeds the cap of ${cap} kbps`);
    return cap;
  }
  return limit;
};

/**
 * Resolves a user-provided video bandwidth limit against {@link MAX_BANDWIDTH_LIMITS}.
 * - a number is a single-stream limit; 0 or negative means "use the cap", higher values are clamped to it
 * - a Map holds per-variant simulcast limits; each variant is resolved the same way
 */
export const resolveBandwidthLimit = (limit: TrackBandwidthLimit, logger: Logger): TrackBandwidthLimit => {
  if (typeof limit === 'number') {
    return resolveAgainstCap(limit, MAX_BANDWIDTH_LIMITS.singleStream, 'single stream', logger);
  }

  const resolved: SimulcastBandwidthLimit = new Map();
  for (const variant of SIMULCAST_VARIANTS) {
    const cap = MAX_BANDWIDTH_LIMITS.simulcast[variant];
    resolved.set(variant, resolveAgainstCap(limit.get(variant), cap, Variant[variant], logger));
  }
  return resolved;
};

export const resolveVariantBandwidthLimit = (
  variant: Variant,
  limit: BandwidthLimit,
  logger: Logger,
): BandwidthLimit => {
  const cap = isSimulcastVariant(variant) ? MAX_BANDWIDTH_LIMITS.simulcast[variant] : MAX_BANDWIDTH_LIMITS.singleStream;
  return resolveAgainstCap(limit, cap, Variant[variant], logger);
};

export const kbpsToBps = (kbps: BandwidthLimit): Bitrate => kbps * 1024;

// The suggested bitrate values are based on our internal tests.
export const defaultBitrates = {
  audio: 50_000 as Bitrate,
  video: kbpsToBps(MAX_BANDWIDTH_LIMITS.singleStream),
} as const;

export const UNLIMITED_BANDWIDTH: Bitrate = 0 as Bitrate;

// The suggested bitrate values are based on our internal tests.
export const defaultSimulcastBitrates: {
  [key in Variant]: Bitrate;
} = {
  [Variant.VARIANT_HIGH]: kbpsToBps(MAX_BANDWIDTH_LIMITS.simulcast[Variant.VARIANT_HIGH]),
  [Variant.VARIANT_MEDIUM]: kbpsToBps(MAX_BANDWIDTH_LIMITS.simulcast[Variant.VARIANT_MEDIUM]),
  [Variant.VARIANT_LOW]: kbpsToBps(MAX_BANDWIDTH_LIMITS.simulcast[Variant.VARIANT_LOW]),
  [Variant.VARIANT_UNSPECIFIED]: 0,
  [Variant.UNRECOGNIZED]: 0,
};
