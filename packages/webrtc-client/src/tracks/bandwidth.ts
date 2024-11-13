export const splitBandwidth = (
  rtcRtpEncodingParameters: RTCRtpEncodingParameters[],
  maxBandwidth: number,
): RTCRtpEncodingParameters[] => {
  const bandwidth = maxBandwidth * 1024;

  if (bandwidth === 0) {
    return rtcRtpEncodingParameters.map((encoding) => ({
      ...encoding,
      maxBitrate: undefined,
    }));
  }

  if (rtcRtpEncodingParameters.length === 0) {
    // This most likely is a race condition. Log an error and prevent catastrophic failure
    console.error("Attempted to limit bandwidth of the track that doesn't have any encodings");
    return rtcRtpEncodingParameters.map((encoding) => ({ ...encoding }));
  }
  if (!rtcRtpEncodingParameters[0]) throw new Error('RTCRtpEncodingParameters is in invalid state');

  // We are solving the following equation:
  // x + (k0/k1)^2 * x + (k0/k2)^2 * x + ... + (k0/kn)^2 * x = bandwidth
  // where x is the bitrate for the first encoding, kn are scaleResolutionDownBy factors
  // square is dictated by the fact that k0/kn is a scale factor, but we are interested in the total number of pixels in the image
  const firstScaleDownBy = rtcRtpEncodingParameters[0].scaleResolutionDownBy || 1;
  const bitrate_parts = rtcRtpEncodingParameters.reduce(
    (acc, value) => acc + (firstScaleDownBy / (value.scaleResolutionDownBy || 1)) ** 2,
    0,
  );
  const x = bandwidth / bitrate_parts;

  return rtcRtpEncodingParameters.map((encoding) => ({
    ...encoding,
    maxBitrate: x * (firstScaleDownBy / (encoding.scaleResolutionDownBy || 1)) ** 2,
  }));
};
