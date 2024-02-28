import { State } from "./state.types";
import { SimulcastConfig, TrackBandwidthLimit, TrackEncoding } from "@jellyfish-dev/ts-client-sdk";
import { Api } from "./api";
import { INITIAL_STATE } from "./useUserMedia";
import { INITIAL_STATE as SCREENSHARE_INITIAL_STATE } from "./useMedia/screenshare";
import { createDefaultDevices } from "./reducer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DEFAULT_STORE: State<any, any> = {
  local: null,
  remote: {},
  status: null,
  tracks: {},
  media: INITIAL_STATE,
  devices: createDefaultDevices(),
  bandwidthEstimation: 0n,
  connectivity: {
    api: null,
    client: null,
  },
  screenshare: SCREENSHARE_INITIAL_STATE,
};

export const createEmptyApi = <PeerMetadata, TrackMetadata>(): Api<PeerMetadata, TrackMetadata> => ({
  addTrack: async (
    _track: MediaStreamTrack,
    _stream: MediaStream,
    _trackMetadata?: TrackMetadata,
    _simulcastConfig?: SimulcastConfig,
    _maxBandwidth?: TrackBandwidthLimit,
  ) => {
    throw Error("Jellyfish client is not connected");
  },
  replaceTrack: async (
    _trackId: string,
    _newTrack: MediaStreamTrack,
    _stream: MediaStream,
    _newTrackMetadata?: TrackMetadata,
  ) => {
    throw Error("Jellyfish client is not connected");
  },
  removeTrack: async (_trackId: string) => Promise.reject("Jellyfish client is not connected"),
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
  updatePeerMetadata: (_peerMetadata: PeerMetadata) => {
    throw Error("Jellyfish client is not connected");
  },
});
