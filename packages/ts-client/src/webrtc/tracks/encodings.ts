import { splitBandwidth } from './bandwidth';

export const getEncodingParameters = (
  parameters: RTCRtpSendParameters,
  bandwidth: number,
): RTCRtpEncodingParameters[] => {
  const unlimitedEncodings = [{}];

  return parameters.encodings.length === 0
    ? unlimitedEncodings
    : splitBandwidth(parameters.encodings, bandwidth);
};
