import { Variant } from '@fishjam-cloud/protobufs/shared';
import { splitBandwidth } from './bandwidth';

export const getEncodingParameters = (
  parameters: RTCRtpSendParameters,
  bandwidth: number,
): RTCRtpEncodingParameters[] => {
  const unlimitedEncodings = [{}];

  return parameters.encodings.length === 0 ? unlimitedEncodings : splitBandwidth(parameters.encodings, bandwidth);
};

export const encodingToVariantMap: Record<string, Variant> = {
  l: Variant.VARIANT_LOW,
  m: Variant.VARIANT_MEDIUM,
  h: Variant.VARIANT_HIGH,
};
