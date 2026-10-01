import { Variant } from '@fishjam-cloud/protobufs/shared';

import { splitBandwidth } from '../bandwidth';
import type { Logger } from '../types';

export const getEncodingParameters = (
  parameters: RTCRtpSendParameters,
  bandwidth: number,
  logger: Logger,
): RTCRtpEncodingParameters[] => {
  const unlimitedEncodings = [{}];

  return parameters.encodings.length === 0
    ? unlimitedEncodings
    : splitBandwidth(parameters.encodings, bandwidth, logger);
};

export const encodingToVariantMap: Record<string, Variant> = {
  l: Variant.VARIANT_LOW,
  m: Variant.VARIANT_MEDIUM,
  h: Variant.VARIANT_HIGH,
};
