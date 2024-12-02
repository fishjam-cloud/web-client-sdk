import type { SimulcastBandwidthLimit, TrackBandwidthLimit } from '../types';
import type { TrackContextImpl } from '../internal';
import { splitBandwidth } from './bandwidth';
import { Variant } from '@fishjam-cloud/protobufs/shared';
import { encodingToVariantMap } from './encodings';

export const createTransceiverConfig = (trackContext: TrackContextImpl): RTCRtpTransceiverInit => {
  if (!trackContext.track) throw new Error(`Cannot create transceiver config for `);

  if (trackContext.track.kind === 'audio') {
    return createAudioTransceiverConfig(trackContext.stream);
  }

  return createVideoTransceiverConfig(trackContext, trackContext.maxBandwidth);
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
): RTCRtpTransceiverInit => {
  if (!trackContext.simulcastConfig) throw new Error(`Simulcast config for track ${trackContext.trackId} not found.`);

  if (trackContext.simulcastConfig.enabled) {
    let simulcastConfig: Map<Variant, number>;

    if (maxBandwidth === 0) {
      simulcastConfig = new Map([
        [Variant.VARIANT_LOW, 0],
        [Variant.VARIANT_MEDIUM, 0],
        [Variant.VARIANT_HIGH, 0],
      ]);
    } else if (typeof maxBandwidth === 'number') {
      throw new Error('Invalid bandwidth limit for simulcast track.');
    } else {
      simulcastConfig = maxBandwidth;
    }

    return createSimulcastTransceiverConfig(trackContext, simulcastConfig);
  }

  if (typeof maxBandwidth === 'number') {
    return createNonSimulcastTransceiverConfig(trackContext, maxBandwidth);
  }

  throw new Error('LocalTrack is in invalid state!');
};

const createNonSimulcastTransceiverConfig = (
  trackContext: TrackContextImpl,
  maxBandwidth: number,
): RTCRtpTransceiverInit => {
  return {
    direction: 'sendonly',
    sendEncodings: splitBandwidth([{ active: true }], maxBandwidth),
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
      scaleResolutionDownBy: 4.0,
      //   scalabilityMode: "L1T" + TEMPORAL_LAYERS_COUNT,
    },
    {
      rid: 'm',
      active: activeEncodings.includes(Variant.VARIANT_MEDIUM),
      scaleResolutionDownBy: 2.0,
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
  };
};

const calculateSimulcastEncodings = (encodings: RTCRtpEncodingParameters[], maxBandwidth: SimulcastBandwidthLimit) => {
  return encodings
    .filter((encoding) => encoding.rid)
    .map((encoding) => {
      const variant = (!!encoding.rid && encodingToVariantMap[encoding.rid]) || Variant.VARIANT_UNSPECIFIED;

      const limit = maxBandwidth.get(variant) || 0;

      return {
        ...encoding,
        maxBitrate: limit > 0 ? limit * 1024 : undefined,
      } satisfies RTCRtpEncodingParameters;
    });
};
