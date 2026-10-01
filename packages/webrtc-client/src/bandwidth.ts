import type { MediaEvent_VariantBitrate } from '@fishjam-cloud/protobufs/peer';
import { Variant } from '@fishjam-cloud/protobufs/shared';

import { getTrackKind, type TrackContextImpl } from './internal';
import type { BandwidthLimit, Logger, SimulcastBandwidthLimit, TrackBandwidthLimit } from './types';

export type Bitrate = number;

// Throughout the SDK "kbps" means 1024 bps, so that the values match the ones reported by the browser.
export const kbpsToBps = (kbps: BandwidthLimit): Bitrate => kbps * 1024;
export const bpsToKbps = (bps: Bitrate): BandwidthLimit => Math.round(bps / 1024);

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

// The suggested bitrate values are based on our internal tests.
export const defaultBitrates = {
  audio: 50_000 as Bitrate,
  video: kbpsToBps(MAX_BANDWIDTH_LIMITS.singleStream),
};

export const SIMULCAST_LAYER_SCALE: Record<SimulcastVariant, number> = {
  [Variant.VARIANT_LOW]: 4,
  [Variant.VARIANT_MEDIUM]: 2,
  [Variant.VARIANT_HIGH]: 1,
};

export const splitBandwidth = (
  rtcRtpEncodingParameters: RTCRtpEncodingParameters[],
  maxBandwidth: number,
  logger: Logger,
): RTCRtpEncodingParameters[] => {
  const bandwidth = kbpsToBps(maxBandwidth);

  if (bandwidth === 0) {
    return rtcRtpEncodingParameters.map((encoding) => ({
      ...encoding,
      maxBitrate: undefined,
    }));
  }

  if (rtcRtpEncodingParameters.length === 0) {
    // This most likely is a race condition. Log an error and prevent catastrophic failure
    logger.error("Attempted to limit bandwidth of the track that doesn't have any encodings");
    return rtcRtpEncodingParameters.map((encoding) => ({ ...encoding }));
  }
  if (!rtcRtpEncodingParameters[0]) throw new Error('RTCRtpEncodingParameters is in invalid state');

  // We are solving the following equation:
  // x + (k0/k1)^2 * x + (k0/k2)^2 * x + ... + (k0/kn)^2 * x = bandwidth
  // where x is the bitrate for the first encoding, kn are scaleResolutionDownBy factors
  // square is dictated by the fact that k0/kn is a scale factor, but we are interested in the total number of pixels in the image
  const firstScaleDownBy = rtcRtpEncodingParameters[0].scaleResolutionDownBy || 1;
  const bitrate_parts = rtcRtpEncodingParameters.reduce(
    (acc, value) => acc + (firstScaleDownBy / (value.scaleResolutionDownBy || 1)) ** 2,
    0,
  );
  const x = bandwidth / bitrate_parts;

  return rtcRtpEncodingParameters.map((encoding) => ({
    ...encoding,
    maxBitrate: x * (firstScaleDownBy / (encoding.scaleResolutionDownBy || 1)) ** 2,
  }));
};

/** Splits a total budget (in kbps) across the simulcast layers proportionally to their pixel count. */
export const splitSimulcastBudget = (budget: number, logger: Logger): SimulcastBandwidthLimit => {
  const layers = SIMULCAST_VARIANTS.map((variant) => ({ scaleResolutionDownBy: SIMULCAST_LAYER_SCALE[variant] }));
  const split = splitBandwidth(layers, budget, logger);

  return new Map(
    SIMULCAST_VARIANTS.map((variant, index) => {
      const maxBitrate = split[index]?.maxBitrate;
      return [variant, maxBitrate ? bpsToKbps(maxBitrate) : 0];
    }),
  );
};

/**
 * Resolves the limit requested for a video track against {@link MAX_BANDWIDTH_LIMITS}.
 * A number is a budget for the whole track, a Map holds per-layer limits; 0 means "use the cap(s)".
 * - single stream: the number is clamped to the single-stream cap; a Map is rejected
 * - simulcast: a number is split across the layers, then every layer is clamped to its own cap
 */
export const resolveTrackBandwidthLimit = (
  requested: TrackBandwidthLimit,
  simulcast: boolean,
  logger: Logger,
): TrackBandwidthLimit => {
  if (!simulcast) {
    if (typeof requested !== 'number') throw new Error('A non-simulcast track expects a single bandwidth limit');
    return resolveSingleStreamLimit(requested, logger);
  }

  if (typeof requested !== 'number') return resolveSimulcastLimits(requested, logger);

  const layers = requested > 0 ? splitSimulcastBudget(requested, logger) : new Map();
  return resolveSimulcastLimits(layers, logger);
};

/**
 * Builds the per-variant bitrates (in bps) reported to the server for a local track,
 * derived from the limits the encoder was configured with.
 */
export const getVariantBitrates = (trackContext: TrackContextImpl): MediaEvent_VariantBitrate[] => {
  const { maxBandwidth } = trackContext;

  if (typeof maxBandwidth === 'number') {
    // 0 means the limit was never set, so report the default for the track kind.
    const fallback = getTrackKind(trackContext) === 'audio' ? defaultBitrates.audio : defaultBitrates.video;
    return [{ variant: Variant.VARIANT_UNSPECIFIED, bitrate: kbpsToBps(maxBandwidth) || fallback }];
  }

  return [...maxBandwidth.entries()].map(([variant, limit]) => ({ variant, bitrate: kbpsToBps(limit) }));
};
