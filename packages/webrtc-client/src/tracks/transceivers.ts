import type { Encoding, SimulcastBandwidthLimit, TrackBandwidthLimit } from '../types';
import type { TrackContextImpl } from '../internal';
import { splitBandwidth } from './bandwidth';

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
    let simulcastConfig: Map<Encoding, number>;

    if (maxBandwidth === 0) {
      simulcastConfig = new Map([
        ['l', 0],
        ['m', 0],
        ['h', 0],
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
