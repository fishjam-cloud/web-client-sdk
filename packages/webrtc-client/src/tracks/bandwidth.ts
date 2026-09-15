import { Variant } from '@fishjam-cloud/protobufs/shared';

import {
  bpsToKbps,
  kbpsToBps,
  resolveSimulcastLimits,
  resolveSingleStreamLimit,
  SIMULCAST_VARIANTS,
  type SimulcastVariant,
} from '../bitrate';
import type { Logger, SimulcastBandwidthLimit, TrackBandwidthLimit } from '../types';

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
