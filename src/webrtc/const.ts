import type { BandwidthLimit, TrackEncoding } from "./webRTCEndpoint";
// const TEMPORAL_LAYERS_COUNT = 2;

export const simulcastTransceiverConfig: RTCRtpTransceiverInit = {
  direction: "sendonly",
  // keep this array from low resolution to high resolution
  // in other case lower resolution encoding can get
  // higher max_bitrate
  sendEncodings: [
    {
      rid: "l",
      active: false,
      // maxBitrate: 4_000_000,
      scaleResolutionDownBy: 4.0,
      //   scalabilityMode: "L1T" + TEMPORAL_LAYERS_COUNT,
    },
    {
      rid: "m",
      active: false,
      scaleResolutionDownBy: 2.0,
    },
    {
      rid: "h",
      active: false,
      // maxBitrate: 4_000_000,
      // scalabilityMode: "L1T" + TEMPORAL_LAYERS_COUNT,
    },
  ],
};

export const defaultBitrates: { audio: BandwidthLimit; video: BandwidthLimit } = { audio: 50_000, video: 2_500_000 };

export const defaultSimulcastBitrates: {
  [key in TrackEncoding]: BandwidthLimit;
} = {
  h: 2_500_000,
  m: 500_000,
  l: 150_000,
};
