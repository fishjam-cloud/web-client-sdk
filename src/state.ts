import { State } from "./state.types";
import { SimulcastConfig, TrackBandwidthLimit, TrackEncoding } from "@jellyfish-dev/ts-client-sdk";
import { Api } from "./api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DEFAULT_STORE: State<any, any> = {
  local: null,
  remote: {},
  status: null,
  tracks: {},
  bandwidthEstimation: BigInt(0), // todo investigate bigint n notation
  connectivity: {
    api: null,
    client: null,
  },
};

export const createEmptyApi = <TrackMetadata>(): Api<TrackMetadata> => ({
  addTrack: (
    track: MediaStreamTrack,
    stream: MediaStream,
    trackMetadata?: TrackMetadata,
    simulcastConfig?: SimulcastConfig,
    maxBandwidth?: TrackBandwidthLimit
  ) => {
    throw Error("Jellyfish client is not connected");
  },
  replaceTrack: (
    trackId: string,
    newTrack: MediaStreamTrack,
    stream: MediaStream,
    newTrackMetadata?: TrackMetadata
  ) => {
    throw Error("Jellyfish client is not connected");
  },
  removeTrack: (trackId: string) => {},
  updateTrackMetadata: (trackId: string, trackMetadata: TrackMetadata) => {
    throw Error("Jellyfish client is not connected");
  },
  disableTrackEncoding: (trackId: string, encoding: TrackEncoding) => {
    throw Error("Jellyfish client is not connected");
  },
  enableTrackEncoding: (trackId: string, encoding: TrackEncoding) => {
    throw Error("Jellyfish client is not connected");
  },
  setTargetTrackEncoding: (trackId: string, encoding: TrackEncoding) => {
    throw Error("Jellyfish client is not connected");
  },
});
