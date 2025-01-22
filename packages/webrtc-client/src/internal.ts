import type { MediaEvent_Track_SimulcastConfig } from '@fishjam-cloud/protobufs/server';
import type { Variant } from '@fishjam-cloud/protobufs/shared';
import EventEmitter from 'events';
import type TypedEmitter from 'typed-emitter';

import type {
  EncodingReason,
  Endpoint,
  TrackBandwidthLimit,
  TrackContext,
  TrackContextEvents,
  TrackKind,
  TrackNegotiationStatus,
  VadStatus,
} from './types';

export const isTrackKind = (kind: string): kind is TrackKind => kind === 'audio' || kind === 'video';

export class TrackContextImpl
  extends (EventEmitter as new () => TypedEmitter<Required<TrackContextEvents>>)
  implements TrackContext
{
  declare endpoint: Endpoint;
  declare trackId: string;
  declare track: MediaStreamTrack | null;
  declare trackKind: TrackKind | null;
  declare stream: MediaStream | null;
  declare metadata?: unknown;
  declare metadataParsingError?: any;
  declare simulcastConfig?: MediaEvent_Track_SimulcastConfig;
  declare maxBandwidth: TrackBandwidthLimit;
  declare encoding?: Variant;
  declare encodingReason?: EncodingReason;
  declare vadStatus: VadStatus;
  declare negotiationStatus: TrackNegotiationStatus;
  // Indicates that metadata were changed when in "offered" negotiationStatus
  // and `updateTrackMetadata` Media Event should be sent after the transition to "done"
  declare pendingMetadataUpdate: boolean;

  constructor(
    endpoint: Endpoint,
    trackId: string,
    metadata: any,
    simulcastConfig: MediaEvent_Track_SimulcastConfig = { enabled: false, enabledVariants: [], disabledVariants: [] },
  ) {
    super();
    this.endpoint = endpoint;
    this.trackId = trackId;
    this.track = null;
    this.trackKind = null;
    this.stream = null;
    this.metadata = metadata;
    this.simulcastConfig = simulcastConfig;
    this.maxBandwidth = 0;
    this.vadStatus = 'silence';
    this.negotiationStatus = 'awaiting';
    this.pendingMetadataUpdate = false;
  }
}

export type EndpointWithTrackContext = Omit<Endpoint, 'tracks'> & {
  tracks: Map<string, TrackContextImpl>;
};
