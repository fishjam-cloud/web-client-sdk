import type { MediaEvent_VariantBitrate } from '@fishjam-cloud/protobufs/peer';
import { Variant } from '@fishjam-cloud/protobufs/shared';

import { defaultBitrates, kbpsToBps } from '../bitrate';
import { getTrackKind, type TrackContextImpl } from '../internal';

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
