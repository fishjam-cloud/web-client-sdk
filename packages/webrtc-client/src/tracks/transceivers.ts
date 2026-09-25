import { Variant } from '@fishjam-cloud/protobufs/shared';

import { kbpsToBps } from '../bitrate';
import type { TrackContextImpl } from '../internal';
import type { Logger, SimulcastBandwidthLimit, TrackBandwidthLimit } from '../types';
import { SIMULCAST_LAYER_SCALE, splitBandwidth } from './bandwidth';
import { encodingToVariantMap } from './encodings';

export const createTransceiverConfig = (trackContext: TrackContextImpl, logger: Logger): RTCRtpTransceiverInit => {
  if (!trackContext.track) throw new Error(`Cannot create transceiver config for `);

  if (trackContext.track.kind === 'audio') {
    return createAudioTransceiverConfig(trackContext.stream);
  }

  return createVideoTransceiverConfig(trackContext, trackContext.maxBandwidth, logger);
};

const createAudioTransceiverConfig = (stream: MediaStream | null): RTCRtpTransceiverInit => {
  return {
    direction: 'sendonly',
    streams: stream ? [stream] : [],
  };
};

const createVideoTransceiverConfig = (
  trackContext: TrackContextImpl,
  maxBandwidth: TrackBandwidthLimit,
  logger: Logger,
): RTCRtpTransceiverInit => {
  if (!trackContext.simulcastConfig) throw new Error(`Simulcast config for track ${trackContext.trackId} not found.`);

  if (trackContext.simulcastConfig.enabled) {
    if (typeof maxBandwidth === 'number') throw new Error('Invalid bandwidth limit for simulcast track.');

    return createSimulcastTransceiverConfig(trackContext, maxBandwidth);
  }

  if (typeof maxBandwidth === 'number') {
    return createNonSimulcastTransceiverConfig(trackContext, maxBandwidth, logger);
  }

  throw new Error('LocalTrack is in invalid state!');
};

const createNonSimulcastTransceiverConfig = (
  trackContext: TrackContextImpl,
  maxBandwidth: number,
  logger: Logger,
): RTCRtpTransceiverInit => {
  return {
    direction: 'sendonly',
    sendEncodings: splitBandwidth([{ active: true }], maxBandwidth, logger),
    streams: trackContext.stream ? [trackContext.stream] : [],
  };
};

const createSimulcastTransceiverConfig = (
  trackContext: TrackContextImpl,
  maxBandwidth: SimulcastBandwidthLimit,
): RTCRtpTransceiverInit => {
  if (!trackContext.simulcastConfig) throw new Error(`Simulcast config for track ${trackContext.trackId} not found.`);

  const activeEncodings = trackContext.simulcastConfig.enabledVariants;

  const encodings: RTCRtpEncodingParameters[] = [
    {
      rid: 'l',
      active: activeEncodings.includes(Variant.VARIANT_LOW),
      // maxBitrate: 4_000_000,
      scaleResolutionDownBy: SIMULCAST_LAYER_SCALE[Variant.VARIANT_LOW],
      //   scalabilityMode: "L1T" + TEMPORAL_LAYERS_COUNT,
    },
    {
      rid: 'm',
      active: activeEncodings.includes(Variant.VARIANT_MEDIUM),
      scaleResolutionDownBy: SIMULCAST_LAYER_SCALE[Variant.VARIANT_MEDIUM],
    },
    {
      rid: 'h',
      active: activeEncodings.includes(Variant.VARIANT_HIGH),
      // maxBitrate: 4_000_000,
      // scalabilityMode: "L1T" + TEMPORAL_LAYERS_COUNT,
    },
  ];

  return {
    direction: 'sendonly',
    // keep this array from low resolution to high resolution
    // in other case lower resolution encoding can get
    // higher max_bitrate
    sendEncodings: calculateSimulcastEncodings(encodings, maxBandwidth),
    streams: trackContext.stream ? [trackContext.stream] : [],
  };
};

export const calculateSimulcastEncodings = (
  encodings: RTCRtpEncodingParameters[],
  maxBandwidth: SimulcastBandwidthLimit,
) => {
  return encodings
    .filter((encoding) => encoding.rid)
    .map((encoding) => {
      const variant = (!!encoding.rid && encodingToVariantMap[encoding.rid]) || Variant.VARIANT_UNSPECIFIED;

      const limit = maxBandwidth.get(variant) || 0;

      return {
        ...encoding,
        maxBitrate: limit > 0 ? kbpsToBps(limit) : undefined,
      } satisfies RTCRtpEncodingParameters;
    });
};
