import type {
  Encoding,
  EncodingReason,
  MetadataParser,
  MLineId,
  SimulcastConfig,
  TrackContext,
} from "../types";
import { RemoteTrack } from "./RemoteTrack";
import type { EndpointWithTrackContext } from "../internal";
import { TrackContextImpl } from "../internal";
import type { WebRTCEndpoint } from "../webRTCEndpoint";
import { isVadStatus } from "../voiceActivityDetection";
import { generateCustomEvent } from "../mediaEvent";

export type TrackId = string
export type EndpointId = string


type SDPTrack = {
  "metadata": null,
  "simulcastConfig": SimulcastConfig
}

export class Remote<EndpointMetadata, TrackMetadata> {
  private readonly remoteTracks: Record<TrackId, RemoteTrack<EndpointMetadata, TrackMetadata>> = {}
  private readonly remoteEndpoints: Record<EndpointId, EndpointWithTrackContext<EndpointMetadata, TrackMetadata>> = {}

  private readonly endpointMetadataParser: MetadataParser<EndpointMetadata>;
  private readonly trackMetadataParser: MetadataParser<TrackMetadata>;

  // temporary for webrtc.emit and webrtc.sendMediaEvent
  private readonly webrtc: WebRTCEndpoint<EndpointMetadata, TrackMetadata>;

  constructor(
    webrtc: WebRTCEndpoint<EndpointMetadata, TrackMetadata>,
    endpointMetadataParser: MetadataParser<EndpointMetadata>,
    trackMetadataParser: MetadataParser<TrackMetadata>
  ) {
    this.webrtc = webrtc;
    this.endpointMetadataParser = endpointMetadataParser;
    this.trackMetadataParser = trackMetadataParser;
  }

  public getTrackByMid = (mid: string): RemoteTrack<EndpointMetadata, TrackMetadata> => {
    const remoteTrack = Object.values(this.remoteTracks).find(remote => remote.mLineId === mid)
    if (!remoteTrack) throw new Error(`Remote track with ${mid} not found`)
    return remoteTrack;
  }

  public addTracks = (
    endpointId: EndpointId,
    tracks: Record<TrackId, SDPTrack>,
    trackIdToMetadata: Record<TrackId, any>
  ) => {
    const endpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata> | undefined = this.remoteEndpoints[endpointId];

    if (!endpoint) throw new Error(`Endpoint ${endpointId} not found`)

    Object.entries(tracks || {})
      .map(([trackId, { simulcastConfig }]) => {
        const trackContext = new TrackContextImpl(endpoint, trackId, trackIdToMetadata[trackId], simulcastConfig, this.trackMetadataParser)

        return new RemoteTrack<EndpointMetadata, TrackMetadata>(trackId, trackContext)
      })
      .forEach((remoteTrack) => {
        this.remoteTracks[remoteTrack.id] = remoteTrack
        endpoint.tracks.set(remoteTrack.id, remoteTrack.trackContext)
        this.webrtc.emit('trackAdded', remoteTrack.trackContext);
      })
  };

  public removeTracks = (trackIds: TrackId[]) => {
    trackIds.forEach((trackId) => {
      this.removeRemoteTrack(trackId)
    });
  }

  public removeRemoteTrack = (trackId: TrackId) => {
    const remoteTrack = this.remoteTracks[trackId]
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`)

    const remoteEndpoint = this.remoteEndpoints[remoteTrack.trackContext.endpoint.id]
    if (!remoteEndpoint) throw new Error(`Endpoint ${remoteTrack.trackContext.endpoint.id} not found`)

    remoteEndpoint.tracks.delete(trackId)
    delete this.remoteTracks[trackId]

    this.webrtc.emit('trackRemoved', remoteTrack.trackContext);
  }

  public addRemoteEndpoint = (endpoint: any) => {
    const newEndpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata> = {
      id: endpoint.id,
      type: endpoint.type,
      metadata: undefined,
      rawMetadata: undefined,
      metadataParsingError: undefined,
      tracks: new Map()
    }

    // mutation in place
    this.updateEndpointMetadata(endpoint, endpoint.metadata)

    this.addEndpoint(newEndpoint);
    this.addTracks(newEndpoint.id, endpoint.tracks, endpoint.trackIdToMetadata)

    this.webrtc.emit('endpointAdded', endpoint);
  }

  private addEndpoint = (
    endpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata>,
  ): void => {
    // #TODO remove this line after fixing deserialization
    // if (Object.prototype.hasOwnProperty.call(endpoint, 'trackIdToMetadata'))
    //   endpoint.tracks = new Map(Object.entries(endpoint.tracks));
    // else endpoint.tracks = new Map();

    this.remoteEndpoints[endpoint.id] = endpoint
  };

  public updateRemoteEndpoint = (data: any) => {
    const endpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata> | undefined = this.remoteEndpoints[data.id]
    if (!endpoint) throw new Error(`Endpoint ${data.id} not found`)

    // mutation in place
    this.updateEndpointMetadata(endpoint, data.metadata)

    this.webrtc.emit('endpointUpdated', endpoint);
  };

  private updateEndpointMetadata = (endpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata>, metadata: unknown) => {
    try {
      endpoint.metadata = this.endpointMetadataParser(metadata);
      endpoint.metadataParsingError = undefined;
    } catch (error) {
      endpoint.metadata = undefined;
      endpoint.metadataParsingError = error;
    }
    endpoint.rawMetadata = metadata;
  }

  public removeRemoteEndpoint = (endpointId: EndpointId) => {
    const endpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata> | undefined = this.remoteEndpoints[endpointId]
    if (!endpoint) throw new Error(`Endpoint ${endpointId} not found`)

    const trackIds = [...endpoint.tracks.values()].map(({ trackId }) => trackId)

    this.removeTracks(trackIds)

    delete this.remoteEndpoints[endpointId]

    this.webrtc.emit('endpointRemoved', endpoint);
  };

  public updateRemoteTrack = (data: any) => {
    const endpointId = data.endpointId
    const endpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata> | undefined = this.remoteEndpoints[endpointId];
    if (!endpoint) throw new Error(`Endpoint ${endpointId} not found`)

    const trackId = data.trackId;

    const remoteTrack = this.remoteTracks[trackId]
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`)

    this.updateTrackMetadata(remoteTrack.trackContext, data.metadata)

    this.webrtc.emit('trackUpdated', remoteTrack.trackContext);
  }

  private updateTrackMetadata = (trackContext: TrackContextImpl<EndpointMetadata, TrackMetadata>, trackMetadata: unknown) => {
    try {
      trackContext.metadata = this.trackMetadataParser(trackMetadata);
      trackContext.metadataParsingError = undefined;
    } catch (error) {
      trackContext.metadataParsingError = error;
      trackContext.metadata = undefined;
    }
    trackContext.rawMetadata = trackMetadata;
  }

  public disableRemoteTrackEncoding = (trackId: TrackId, encoding: Encoding) => {
    const remoteTrack = this.remoteTracks[trackId]
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`)

    remoteTrack.disableTrackEncoding(encoding)

    this.webrtc.emit('trackEncodingDisabled', remoteTrack.trackContext, encoding);
  }

  public enableRemoteTrackEncoding = (trackId: TrackId, encoding: Encoding) => {
    const remoteTrack = this.remoteTracks[trackId]
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`)

    remoteTrack.enableTrackEncoding(encoding)

    this.webrtc.emit('trackEncodingEnabled', remoteTrack.trackContext, encoding);
  }

  public setRemoteTrackEncoding = (trackId: TrackId, encoding: Encoding, reason: EncodingReason) => {
    const remoteTrack = this.remoteTracks[trackId]
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`)

    remoteTrack.trackContext.encoding = encoding;
    remoteTrack.trackContext.encodingReason = reason;

    remoteTrack.trackContext.emit('encodingChanged', remoteTrack.trackContext);
  };

  public setRemoteTrackVadStatus = (trackId: TrackId, vadStatus: string) => {
    const remoteTrack = this.remoteTracks[trackId]
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`)

    if (isVadStatus(vadStatus)) {
      remoteTrack.trackContext.vadStatus = vadStatus;
      remoteTrack.trackContext.emit('voiceActivityChanged', remoteTrack.trackContext);
    } else {
      console.warn('Received unknown vad status: ', vadStatus);
    }
  };

  public getRemoteTrackContexts = (): Record<string, TrackContext<EndpointMetadata, TrackMetadata>> => {
    return Object.values(this.remoteTracks)
      .reduce((acc, current) => ({
        ...acc,
        [current.trackContext.trackId]: current.trackContext
      }), {} as Record<string, TrackContext<EndpointMetadata, TrackMetadata>>)
  }

  public getRemoteEndpoints = (): Record<string, EndpointWithTrackContext<EndpointMetadata, TrackMetadata>> => {
    return Object.values(this.remoteEndpoints)
      .reduce((acc, current) =>
          ({ ...acc, [current.id]: current }),
        {} as Record<string, EndpointWithTrackContext<EndpointMetadata, TrackMetadata>>)
  }

  public setTargetRemoteTrackEncoding = (trackId: TrackId, variant: Encoding) => {
    const remoteTrack = this.remoteTracks[trackId]
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`)

    try {
      remoteTrack.setTargetTrackEncoding(variant)

      const mediaEvent = generateCustomEvent({
        type: 'setTargetTrackVariant',
        data: {
          trackId: trackId,
          variant,
        },
      });

      this.webrtc.sendMediaEvent(mediaEvent);
      this.webrtc.emit('targetTrackEncodingRequested', {
        trackId,
        variant,
      });

    } catch (e) {
      console.warn(e)
    }
  }

  public updateMLineIds = (midToTrackId: Record<MLineId, TrackId>) => {
    Object.entries(midToTrackId)
      .forEach(([mLineId, trackId]) => {
        const remoteTrack = this.remoteTracks[trackId]
        if (remoteTrack) {
          remoteTrack.setMLineId(mLineId)
        }
      })
  }
}