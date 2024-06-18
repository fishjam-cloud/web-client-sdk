import {
  SimulcastBandwidthLimit,
  TrackBandwidthLimit,
  TrackEncoding,
} from './types';

export const applyBandwidthLimitation = (
  encodings: RTCRtpEncodingParameters[],
  maxBandwidth: TrackBandwidthLimit,
) => {
  if (typeof maxBandwidth === 'number') {
    // non-simulcast limitation
    splitBandwidth(encodings, (maxBandwidth as number) * 1024);
  } else {
    // simulcast bandwidth limit
    encodings
      .filter((encoding) => encoding.rid)
      .forEach((encoding) => {
        const limit =
          (maxBandwidth as SimulcastBandwidthLimit).get(
            encoding.rid! as TrackEncoding,
          ) || 0;

        if (limit > 0) {
          encoding.maxBitrate = limit * 1024;
        } else delete encoding.maxBitrate;
      });
  }
};

const splitBandwidth = (
  encodings: RTCRtpEncodingParameters[],
  bandwidth: number,
) => {
  if (bandwidth === 0) {
    encodings.forEach((encoding) => delete encoding.maxBitrate);
    return;
  }

  if (encodings.length == 0) {
    // This most likely is a race condition. Log an error and prevent catastrophic failure
    console.error(
      "Attempted to limit bandwidth of the track that doesn't have any encodings",
    );
    return;
  }

  // We are solving the following equation:
  // x + (k0/k1)^2 * x + (k0/k2)^2 * x + ... + (k0/kn)^2 * x = bandwidth
  // where x is the bitrate for the first encoding, kn are scaleResolutionDownBy factors
  // square is dictated by the fact that k0/kn is a scale factor, but we are interested in the total number of pixels in the image
  const firstScaleDownBy = encodings![0].scaleResolutionDownBy || 1;
  const bitrate_parts = encodings.reduce(
    (acc, value) =>
      acc + (firstScaleDownBy / (value.scaleResolutionDownBy || 1)) ** 2,
    0,
  );
  const x = bandwidth / bitrate_parts;

  encodings.forEach((value) => {
    value.maxBitrate =
      x * (firstScaleDownBy / (value.scaleResolutionDownBy || 1)) ** 2;
  });
};
