import EventEmitter from 'events';
import type TypedEmitter from 'typed-emitter';
import type {
  EncodingReason,
  Endpoint,
  SimulcastConfig,
  TrackBandwidthLimit,
  TrackContext,
  TrackContextEvents,
  Encoding,
  TrackKind,
  TrackNegotiationStatus,
  VadStatus,
} from './types';

export const isTrackKind = (kind: string): kind is TrackKind => kind === 'audio' || kind === 'video';

export class TrackContextImpl
  extends (EventEmitter as new () => TypedEmitter<Required<TrackContextEvents>>)
  implements TrackContext
{
  endpoint: Endpoint;
  trackId: string;
  track: MediaStreamTrack | null = null;
  trackKind: TrackKind | null = null;
  stream: MediaStream | null = null;
  metadata?: unknown;
  metadataParsingError?: any;
  simulcastConfig?: SimulcastConfig;
  maxBandwidth: TrackBandwidthLimit = 0;
  encoding?: Encoding;
  encodingReason?: EncodingReason;
  vadStatus: VadStatus = 'silence';
  negotiationStatus: TrackNegotiationStatus = 'awaiting';

  // Indicates that metadata were changed when in "offered" negotiationStatus
  // and `updateTrackMetadata` Media Event should be sent after the transition to "done"
  pendingMetadataUpdate: boolean = false;

  constructor(endpoint: Endpoint, trackId: string, metadata: any, simulcastConfig: SimulcastConfig) {
    super();
    this.endpoint = endpoint;
    this.trackId = trackId;
    this.metadata = metadata;
    this.simulcastConfig = simulcastConfig;
  }
}

export type EndpointWithTrackContext = Omit<Endpoint, 'tracks'> & {
  tracks: Map<string, TrackContextImpl>;
};
