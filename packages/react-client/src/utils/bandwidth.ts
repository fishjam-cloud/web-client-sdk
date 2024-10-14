import type { BandwidthLimits } from "../types/public";

export const mergeWithDefaultBandwitdthLimits = (limits?: Partial<BandwidthLimits>): BandwidthLimits => ({
  singleResolution: limits?.singleResolution ?? 0,
  simulcast: limits?.simulcast ?? { l: 0, m: 0, h: 0 },
});
