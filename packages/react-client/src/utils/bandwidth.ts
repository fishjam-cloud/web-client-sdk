import { Variant } from "@fishjam-cloud/ts-client";
import type { BandwidthLimits } from "../types/public";

export const ALL_VARIANTS_SIMULCAST = [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH] as const;

export const mergeWithDefaultBandwitdthLimits = (limits?: Partial<BandwidthLimits>): BandwidthLimits => ({
  singleStream: limits?.singleStream ?? 0,
  simulcast: limits?.simulcast ?? { [Variant.VARIANT_LOW]: 0, [Variant.VARIANT_MEDIUM]: 0, [Variant.VARIANT_HIGH]: 0 },
});
