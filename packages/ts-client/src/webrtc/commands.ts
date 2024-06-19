import { SimulcastConfig, TrackBandwidthLimit } from './types';
import { Deferred } from './deferred';

export type AddTrackCommand<TrackMetadata> = {
  commandType: 'ADD-TRACK';
  trackId: string;
  track: MediaStreamTrack;
  stream: MediaStream;
  trackMetadata?: TrackMetadata;
  simulcastConfig: SimulcastConfig;
  maxBandwidth: TrackBandwidthLimit;
  resolutionNotifier: Deferred<void>;
};

export type RemoveTrackCommand = {
  commandType: 'REMOVE-TRACK';
  trackId: string;
  resolutionNotifier: Deferred<void>;
};

export type ReplaceTackCommand<TrackMetadata> = {
  commandType: 'REPLACE-TRACK';
  trackId: string;
  newTrack: MediaStreamTrack | null;
  newTrackMetadata?: TrackMetadata;
  resolutionNotifier: Deferred<void>;
};

export type Command<TrackMetadata> =
  | AddTrackCommand<TrackMetadata>
  | RemoveTrackCommand
  | ReplaceTackCommand<TrackMetadata>;
