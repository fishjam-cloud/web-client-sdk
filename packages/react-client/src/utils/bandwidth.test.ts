import { MAX_BANDWIDTH_LIMITS, Variant } from "@fishjam-cloud/ts-client";
import { expect, it } from "vitest";

import { mergeWithDefaultBandwitdthLimits } from "./bandwidth";

it("defaults every limit to the cap", () => {
  expect(mergeWithDefaultBandwitdthLimits()).toEqual({
    singleStream: MAX_BANDWIDTH_LIMITS.singleStream,
    simulcast: MAX_BANDWIDTH_LIMITS.simulcast,
  });
});

it("keeps user values and fills the missing simulcast layers with the cap", () => {
  const merged = mergeWithDefaultBandwitdthLimits({ singleStream: 800, simulcast: { [Variant.VARIANT_HIGH]: 1000 } });

  expect(merged.singleStream).toBe(800);
  expect(merged.simulcast[Variant.VARIANT_HIGH]).toBe(1000);
  expect(merged.simulcast[Variant.VARIANT_MEDIUM]).toBe(MAX_BANDWIDTH_LIMITS.simulcast[Variant.VARIANT_MEDIUM]);
  expect(merged.simulcast[Variant.VARIANT_LOW]).toBe(MAX_BANDWIDTH_LIMITS.simulcast[Variant.VARIANT_LOW]);
});
