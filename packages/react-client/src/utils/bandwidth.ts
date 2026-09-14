import { MAX_BANDWIDTH_LIMITS, Variant } from "@fishjam-cloud/ts-client";

import type { BandwidthLimits } from "../types/public";

export const ALL_VARIANTS_SIMULCAST = [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH] as const;

export const mergeWithDefaultBandwitdthLimits = (limits?: Partial<BandwidthLimits>): BandwidthLimits => ({
  singleStream: limits?.singleStream ?? MAX_BANDWIDTH_LIMITS.singleStream,
  simulcast: { ...MAX_BANDWIDTH_LIMITS.simulcast, ...limits?.simulcast },
});
