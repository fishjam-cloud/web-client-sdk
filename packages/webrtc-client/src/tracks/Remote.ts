import type { Encoding, EncodingReason, MLineId, SimulcastConfig, TrackContext, WebRTCEndpointEvents } from '../types';
import { RemoteTrack } from './RemoteTrack';
import type { EndpointWithTrackContext } from '../internal';
import { TrackContextImpl } from '../internal';
import { isVadStatus } from '../voiceActivityDetection';
import { generateCustomEvent, type MediaEvent } from '../mediaEvent';
import type { EndpointId, TrackId } from './TrackCommon';

type SDPTrack = {
  metadata: null;
  simulcastConfig: SimulcastConfig;
};

export class Remote {
  private readonly remoteTracks: Record<TrackId, RemoteTrack> = {};
  private readonly remoteEndpoints: Record<EndpointId, EndpointWithTrackContext> = {};

  private readonly emit: <E extends keyof Required<WebRTCEndpointEvents>>(
    event: E,
    ...args: Parameters<Required<WebRTCEndpointEvents>[E]>
  ) => void;
  private readonly sendMediaEvent: (mediaEvent: MediaEvent) => void;

  constructor(
    emit: <E extends keyof Required<WebRTCEndpointEvents>>(
      event: E,
      ...args: Parameters<Required<WebRTCEndpointEvents>[E]>
    ) => void,
    sendMediaEvent: (mediaEvent: MediaEvent) => void,
  ) {
    this.emit = emit;
    this.sendMediaEvent = sendMediaEvent;
  }

  public getTrackByMid = (mid: string): RemoteTrack => {
    const remoteTrack = Object.values(this.remoteTracks).find((remote) => remote.mLineId === mid);
    if (!remoteTrack) throw new Error(`Remote track with ${mid} not found`);
    return remoteTrack;
  };

  public addTracks = (
    endpointId: EndpointId,
    tracks: Record<TrackId, SDPTrack>,
    trackIdToMetadata: Record<TrackId, any>,
  ) => {
    const endpoint: EndpointWithTrackContext | undefined = this.remoteEndpoints[endpointId];

    if (!endpoint) throw new Error(`Endpoint ${endpointId} not found`);

    Object.entries(tracks || {})
      .map(([trackId, { simulcastConfig }]) => {
        const trackContext = new TrackContextImpl(endpoint, trackId, trackIdToMetadata[trackId], simulcastConfig);

        return new RemoteTrack(trackId, trackContext);
      })
      .forEach((remoteTrack) => {
        this.remoteTracks[remoteTrack.id] = remoteTrack;
        endpoint.tracks.set(remoteTrack.id, remoteTrack.trackContext);
        this.emit('trackAdded', remoteTrack.trackContext);
      });
  };

  public removeTracks = (trackIds: TrackId[]) => {
    trackIds.forEach((trackId) => {
      this.removeRemoteTrack(trackId);
    });
  };

  private removeRemoteTrack = (trackId: TrackId) => {
    const remoteTrack = this.remoteTracks[trackId];
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`);

    const remoteEndpoint = this.remoteEndpoints[remoteTrack.trackContext.endpoint.id];
    if (!remoteEndpoint) throw new Error(`Endpoint ${remoteTrack.trackContext.endpoint.id} not found`);

    remoteEndpoint.tracks.delete(trackId);
    delete this.remoteTracks[trackId];

    this.emit('trackRemoved', remoteTrack.trackContext);
  };

  public addRemoteEndpoint = (endpoint: any, sendNotification: boolean = true) => {
    const newEndpoint: EndpointWithTrackContext = {
      id: endpoint.id,
      type: endpoint.type,
      metadata: undefined,
      tracks: new Map(),
    };

    newEndpoint.metadata = endpoint?.metadata;

    this.addEndpoint(newEndpoint);
    this.addTracks(newEndpoint.id, endpoint.tracks, endpoint.trackIdToMetadata);

    if (sendNotification) {
      this.emit('endpointAdded', endpoint);
    }
  };

  private addEndpoint = (endpoint: EndpointWithTrackContext): void => {
    this.remoteEndpoints[endpoint.id] = endpoint;
  };

  public updateRemoteEndpoint = (data: any) => {
    const endpoint: EndpointWithTrackContext | undefined = this.remoteEndpoints[data.id];
    if (!endpoint) throw new Error(`Endpoint ${data.id} not found`);

    endpoint.metadata = data.metadata;

    this.emit('endpointUpdated', endpoint);
  };

  public removeRemoteEndpoint = (endpointId: EndpointId) => {
    const endpoint: EndpointWithTrackContext | undefined = this.remoteEndpoints[endpointId];
    if (!endpoint) throw new Error(`Endpoint ${endpointId} not found`);

    const trackIds = [...endpoint.tracks.values()].map(({ trackId }) => trackId);

    this.removeTracks(trackIds);

    delete this.remoteEndpoints[endpointId];

    this.emit('endpointRemoved', endpoint);
  };

  public updateRemoteTrack = (data: any) => {
    const endpointId = data.endpointId;
    const endpoint: EndpointWithTrackContext | undefined = this.remoteEndpoints[endpointId];
    if (!endpoint) throw new Error(`Endpoint ${endpointId} not found`);

    const trackId = data.trackId;

    const remoteTrack = this.remoteTracks[trackId];
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`);

    remoteTrack.trackContext.metadata = data.metadata;

    this.emit('trackUpdated', remoteTrack.trackContext);
  };

  public disableRemoteTrackEncoding = (trackId: TrackId, encoding: Encoding) => {
    const remoteTrack = this.remoteTracks[trackId];
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`);

    remoteTrack.disableTrackEncoding(encoding);

    this.emit('trackEncodingDisabled', remoteTrack.trackContext, encoding);
  };

  public enableRemoteTrackEncoding = (trackId: TrackId, encoding: Encoding) => {
    const remoteTrack = this.remoteTracks[trackId];
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`);

    remoteTrack.enableTrackEncoding(encoding);

    this.emit('trackEncodingEnabled', remoteTrack.trackContext, encoding);
  };

  public setRemoteTrackEncoding = (trackId: TrackId, encoding: Encoding, reason: EncodingReason) => {
    const remoteTrack = this.remoteTracks[trackId];
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`);

    remoteTrack.trackContext.encoding = encoding;
    remoteTrack.trackContext.encodingReason = reason;

    remoteTrack.trackContext.emit('encodingChanged', remoteTrack.trackContext);
  };

  public setRemoteTrackVadStatus = (trackId: TrackId, vadStatus: string) => {
    const remoteTrack = this.remoteTracks[trackId];
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`);

    if (isVadStatus(vadStatus)) {
      remoteTrack.trackContext.vadStatus = vadStatus;
      remoteTrack.trackContext.emit('voiceActivityChanged', remoteTrack.trackContext);
    } else {
      console.warn('Received unknown vad status: ', vadStatus);
    }
  };

  public getRemoteTrackContexts = (): Record<string, TrackContext> => {
    return Object.values(this.remoteTracks).reduce(
      (acc, current) => ({
        ...acc,
        [current.trackContext.trackId]: current.trackContext,
      }),
      {} as Record<string, TrackContext>,
    );
  };

  public getRemoteEndpoints = (): Record<string, EndpointWithTrackContext> => {
    return Object.values(this.remoteEndpoints).reduce(
      (acc, current) => ({ ...acc, [current.id]: current }),
      {} as Record<string, EndpointWithTrackContext>,
    );
  };

  public setTargetRemoteTrackEncoding = (trackId: TrackId, variant: Encoding) => {
    const remoteTrack = this.remoteTracks[trackId];
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`);

    try {
      remoteTrack.setTargetTrackEncoding(variant);

      const mediaEvent = generateCustomEvent({
        type: 'setTargetTrackVariant',
        data: {
          trackId: trackId,
          variant,
        },
      });

      this.sendMediaEvent(mediaEvent);
      this.emit('targetTrackEncodingRequested', {
        trackId,
        variant,
      });
    } catch (e) {
      console.warn(e);
    }
  };

  public updateMLineIds = (midToTrackId: Record<MLineId, TrackId>) => {
    Object.entries(midToTrackId).forEach(([mLineId, trackId]) => {
      const remoteTrack = this.remoteTracks[trackId];
      if (remoteTrack) {
        remoteTrack.setMLineId(mLineId);
      }
    });
  };
}
