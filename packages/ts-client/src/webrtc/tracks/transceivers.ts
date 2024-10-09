import type { Encoding, SimulcastBandwidthLimit, TrackBandwidthLimit } from '../types';
import type { TrackContextImpl } from '../internal';
import { splitBandwidth } from './bandwidth';

export const createTransceiverConfig = (trackContext: TrackContextImpl<unknown, unknown>): RTCRtpTransceiverInit => {
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
  trackContext: TrackContextImpl<unknown, unknown>,
  maxBandwidth: TrackBandwidthLimit,
): RTCRtpTransceiverInit => {
  if (!trackContext.simulcastConfig) throw new Error(`Simulcast config for track ${trackContext.trackId} not found.`);

  if (typeof maxBandwidth === 'number' && maxBandwidth !== 0) {
    return createNonSimulcastTransceiverConfig(trackContext, maxBandwidth);
  }

  if (trackContext.simulcastConfig.enabled) {
    const defaultConfig = new Map<Encoding, number>([
      ['l', 0],
      ['m', 0],
      ['h', 0],
    ]);
    const maxBandwidthMap = maxBandwidth === 0 ? defaultConfig : maxBandwidth;

    return createSimulcastTransceiverConfig(trackContext, maxBandwidthMap);
  }

  throw new Error('LocalTrack is in invalid state!');
};

const createNonSimulcastTransceiverConfig = (
  trackContext: TrackContextImpl<unknown, unknown>,
  maxBandwidth: number,
): RTCRtpTransceiverInit => {
  return {
    direction: 'sendonly',
    sendEncodings: splitBandwidth([{ active: true }], maxBandwidth),
    streams: trackContext.stream ? [trackContext.stream] : [],
  };
};

const createSimulcastTransceiverConfig = (
  trackContext: TrackContextImpl<unknown, unknown>,
  maxBandwidth: SimulcastBandwidthLimit,
): RTCRtpTransceiverInit => {
  if (!trackContext.simulcastConfig) throw new Error(`Simulcast config for track ${trackContext.trackId} not found.`);

  const activeEncodings = trackContext.simulcastConfig.activeEncodings;

  const encodings: RTCRtpEncodingParameters[] = [
    {
      rid: 'l',
      active: activeEncodings.includes('l'),
      // maxBitrate: 4_000_000,
      scaleResolutionDownBy: 4.0,
      //   scalabilityMode: "L1T" + TEMPORAL_LAYERS_COUNT,
    },
    {
      rid: 'm',
      active: activeEncodings.includes('m'),
      scaleResolutionDownBy: 2.0,
    },
    {
      rid: 'h',
      active: activeEncodings.includes('h'),
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
      const rid = encoding.rid! as Encoding;

      const limit = maxBandwidth.get(rid) || 0;

      return {
        ...encoding,
        maxBitrate: limit > 0 ? limit * 1024 : undefined,
      } satisfies RTCRtpEncodingParameters;
    });
};
