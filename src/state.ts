import { State } from "./state.types";
import { SimulcastConfig, TrackBandwidthLimit, TrackEncoding } from "@jellyfish-dev/ts-client-sdk";
import { Api } from "./api";
import { INITIAL_STATE } from "./useUserMedia";
import { createDefaultDevices } from "./reducer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DEFAULT_STORE: State<any, any> = {
  local: null,
  remote: {},
  status: null,
  tracks: {},
  media: INITIAL_STATE,
  devices: createDefaultDevices(),
  bandwidthEstimation: BigInt(0), // todo investigate bigint n notation
  connectivity: {
    api: null,
    client: null,
  },
};

export const createEmptyApi = <TrackMetadata>(): Api<TrackMetadata> => ({
  addTrack: (
    _track: MediaStreamTrack,
    _stream: MediaStream,
    _trackMetadata?: TrackMetadata,
    _simulcastConfig?: SimulcastConfig,
    _maxBandwidth?: TrackBandwidthLimit
  ) => {
    throw Error("Jellyfish client is not connected");
  },
  replaceTrack: (
    _trackId: string,
    _newTrack: MediaStreamTrack,
    _stream: MediaStream,
    _newTrackMetadata?: TrackMetadata
  ) => {
    throw Error("Jellyfish client is not connected");
  },
  removeTrack: (_trackId: string) => {},
  updateTrackMetadata: (_trackId: string, _trackMetadata: TrackMetadata) => {
    throw Error("Jellyfish client is not connected");
  },
  disableTrackEncoding: (_trackId: string, _encoding: TrackEncoding) => {
    throw Error("Jellyfish client is not connected");
  },
  enableTrackEncoding: (_trackId: string, _encoding: TrackEncoding) => {
    throw Error("Jellyfish client is not connected");
  },
  setTargetTrackEncoding: (_trackId: string, _encoding: TrackEncoding) => {
    throw Error("Jellyfish client is not connected");
  },
});
