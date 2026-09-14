import { Variant } from '@fishjam-cloud/protobufs/shared';

import { type BandwidthLimit, type Logger, type SimulcastBandwidthLimit, type TrackBandwidthLimit } from './types';

export type Bitrate = number;
export type Bitrates = Record<Variant, Bitrate> | Bitrate;

/**
 * Hard caps (in kbps) for the bitrate of an outgoing video track.
 * A limit passed to the SDK is never allowed to exceed these values, and an unset (0) limit resolves to them.
 */
export const MAX_BANDWIDTH_LIMITS = {
  singleStream: 1500,
  simulcast: {
    [Variant.VARIANT_LOW]: 150,
    [Variant.VARIANT_MEDIUM]: 500,
    [Variant.VARIANT_HIGH]: 1500,
  },
} as const satisfies { singleStream: BandwidthLimit; simulcast: Record<SimulcastVariant, BandwidthLimit> };

/** The variants that have a simulcast layer, ordered from the lowest to the highest resolution. */
export const SIMULCAST_VARIANTS = [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH] as const;

export type SimulcastVariant = (typeof SIMULCAST_VARIANTS)[number];

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
 * Resolves a single-stream video limit against {@link MAX_BANDWIDTH_LIMITS.singleStream}.
 * 0 or a negative value means "use the cap"; higher values are clamped to it.
 */
export const resolveSingleStreamLimit = (limit: BandwidthLimit, logger: Logger): BandwidthLimit =>
  resolveAgainstCap(limit, MAX_BANDWIDTH_LIMITS.singleStream, 'single stream', logger);

/**
 * Resolves per-variant simulcast limits against {@link MAX_BANDWIDTH_LIMITS.simulcast}.
 * Every simulcast variant is present in the result: a missing, 0 or negative entry resolves to that variant's cap,
 * and higher values are clamped to it.
 */
export const resolveSimulcastLimits = (limits: SimulcastBandwidthLimit, logger: Logger): SimulcastBandwidthLimit => {
  const resolved: SimulcastBandwidthLimit = new Map();
  for (const variant of SIMULCAST_VARIANTS) {
    const cap = MAX_BANDWIDTH_LIMITS.simulcast[variant];
    resolved.set(variant, resolveAgainstCap(limits.get(variant), cap, Variant[variant], logger));
  }
  return resolved;
};

/**
 * Resolves a user-provided video bandwidth limit against {@link MAX_BANDWIDTH_LIMITS}.
 * A number is treated as a single-stream limit, a Map as per-variant simulcast limits.
 */
export const resolveBandwidthLimit = (limit: TrackBandwidthLimit, logger: Logger): TrackBandwidthLimit =>
  typeof limit === 'number' ? resolveSingleStreamLimit(limit, logger) : resolveSimulcastLimits(limit, logger);

/**
 * Resolves the limit of one simulcast layer against its cap. Throws for a variant that has no layer.
 */
export const resolveVariantBandwidthLimit = (
  variant: Variant,
  limit: BandwidthLimit,
  logger: Logger,
): BandwidthLimit => {
  if (!isSimulcastVariant(variant)) throw new Error(`${Variant[variant]} is not a simulcast variant`);

  return resolveAgainstCap(limit, MAX_BANDWIDTH_LIMITS.simulcast[variant], Variant[variant], logger);
};

// Throughout the SDK "kbps" means 1024 bps, so that the values match the ones reported by the browser.
export const kbpsToBps = (kbps: BandwidthLimit): Bitrate => kbps * 1024;
export const bpsToKbps = (bps: Bitrate): BandwidthLimit => Math.round(bps / 1024);

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
