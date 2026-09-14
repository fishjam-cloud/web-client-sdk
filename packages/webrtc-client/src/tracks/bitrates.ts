import type { MediaEvent_VariantBitrate } from '@fishjam-cloud/protobufs/peer';
import { Variant } from '@fishjam-cloud/protobufs/shared';

import { defaultBitrates, kbpsToBps } from '../bitrate';
import type { TrackContextImpl } from '../internal';

/**
 * Builds the per-variant bitrates (in bps) reported to the server for a local track,
 * derived from the limits the encoder was configured with.
 */
export const getVariantBitrates = (trackContext: TrackContextImpl): MediaEvent_VariantBitrate[] => {
  const kind = trackContext.track?.kind ?? trackContext.trackKind;
  if (kind === 'audio') return [{ variant: Variant.VARIANT_UNSPECIFIED, bitrate: defaultBitrates.audio }];

  const { maxBandwidth } = trackContext;
  if (typeof maxBandwidth === 'number') {
    return [{ variant: Variant.VARIANT_UNSPECIFIED, bitrate: kbpsToBps(maxBandwidth) || defaultBitrates.video }];
  }

  return [...maxBandwidth.entries()].map(([variant, limit]) => ({ variant, bitrate: kbpsToBps(limit) }));
};
