import EventEmitter from 'events';
import TypedEmitter from 'typed-emitter';
import {
  EncodingReason,
  Endpoint,
  MetadataParser,
  SimulcastConfig,
  TrackBandwidthLimit,
  TrackContext,
  TrackContextEvents,
  TrackEncoding,
  TrackNegotiationStatus,
  VadStatus,
} from './types';

export class TrackContextImpl<EndpointMetadata, ParsedMetadata>
  extends (EventEmitter as {
    new <EndpointMetadata, ParsedMetadata>(): TypedEmitter<
      Required<TrackContextEvents<EndpointMetadata, ParsedMetadata>>
    >;
  })<EndpointMetadata, ParsedMetadata>
  implements TrackContext<EndpointMetadata, ParsedMetadata>
{
  endpoint: Endpoint<EndpointMetadata, ParsedMetadata>;
  trackId: string;
  track: MediaStreamTrack | null = null;
  stream: MediaStream | null = null;
  metadata?: ParsedMetadata;
  rawMetadata: any;
  metadataParsingError?: any;
  simulcastConfig?: SimulcastConfig;
  maxBandwidth: TrackBandwidthLimit = 0;
  encoding?: TrackEncoding;
  encodingReason?: EncodingReason;
  vadStatus: VadStatus = 'silence';
  negotiationStatus: TrackNegotiationStatus = 'awaiting';

  // Indicates that metadata were changed when in "offered" negotiationStatus
  // and `updateTrackMetadata` Media Event should be sent after the transition to "done"
  pendingMetadataUpdate: boolean = false;

  constructor(
    endpoint: Endpoint<EndpointMetadata, ParsedMetadata>,
    trackId: string,
    metadata: any,
    simulcastConfig: SimulcastConfig,
    metadataParser: MetadataParser<ParsedMetadata>,
  ) {
    super();
    this.endpoint = endpoint;
    this.trackId = trackId;
    try {
      this.metadata = metadataParser(metadata);
    } catch (error) {
      this.metadataParsingError = error;
    }
    this.rawMetadata = metadata;
    this.simulcastConfig = simulcastConfig;
  }
}

export type EndpointWithTrackContext<EndpointMetadata, TrackMetadata> = Omit<
  Endpoint<EndpointMetadata, TrackMetadata>,
  'tracks'
> & {
  tracks: Map<string, TrackContextImpl<EndpointMetadata, TrackMetadata>>;
};
