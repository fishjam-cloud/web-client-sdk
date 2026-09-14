import { MAX_BANDWIDTH_LIMITS } from "@fishjam-cloud/ts-client";

import type { BandwidthLimits, BandwidthLimitsInput } from "../types/public";

export const mergeWithDefaultBandwidthLimits = (limits?: BandwidthLimitsInput): BandwidthLimits => ({
  singleStream: limits?.singleStream ?? MAX_BANDWIDTH_LIMITS.singleStream,
  simulcast: { ...MAX_BANDWIDTH_LIMITS.simulcast, ...limits?.simulcast },
});
