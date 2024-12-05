import type { MediaEvent as PeerMediaEvent } from '@fishjam-cloud/protobufs/peer';
import { MediaEvent_EnableTrackVariant } from '@fishjam-cloud/protobufs/peer';
import type { MediaEvent_Track } from '@fishjam-cloud/protobufs/server';
import { MediaEvent_VadNotification_Status } from '@fishjam-cloud/protobufs/server';
import type { Variant } from '@fishjam-cloud/protobufs/shared';

import type { EndpointWithTrackContext } from '../internal';
import { TrackContextImpl } from '../internal';
import type {
  EncodingReason,
  MetadataJson,
  RemoteTrackId,
  TrackContext,
  VadStatus,
  WebRTCEndpointEvents,
} from '../types';
import { RemoteTrack } from './RemoteTrack';
import type { EndpointId, TrackId } from './TrackCommon';

export class Remote {
  private readonly remoteTracks: Record<TrackId, RemoteTrack> = {};
  private readonly remoteEndpoints: Record<EndpointId, EndpointWithTrackContext> = {};

  private readonly emit: <E extends keyof Required<WebRTCEndpointEvents>>(
    event: E,
    ...args: Parameters<Required<WebRTCEndpointEvents>[E]>
  ) => void;
  private readonly sendMediaEvent: (mediaEvent: PeerMediaEvent) => void;

  constructor(
    emit: <E extends keyof Required<WebRTCEndpointEvents>>(
      event: E,
      ...args: Parameters<Required<WebRTCEndpointEvents>[E]>
    ) => void,
    sendMediaEvent: (mediaEvent: PeerMediaEvent) => void,
  ) {
    this.emit = emit;
    this.sendMediaEvent = sendMediaEvent;
  }

  public getTrackByMid = (mid: string): RemoteTrack => {
    const remoteTrack = Object.values(this.remoteTracks).find((remote) => remote.mLineId === mid);
    if (!remoteTrack) throw new Error(`Remote track with ${mid} not found`);
    return remoteTrack;
  };

  public addTracks = (endpointId: EndpointId, tracks: Record<TrackId, MediaEvent_Track>) => {
    const endpoint: EndpointWithTrackContext | undefined = this.remoteEndpoints[endpointId];

    if (!endpoint) throw new Error(`Endpoint ${endpointId} not found`);

    Object.entries(tracks)
      .map(([trackId, { metadataJson, simulcastConfig }]) => {
        const parsedMetadata = metadataJson ? JSON.parse(metadataJson) : undefined;

        const trackContext = new TrackContextImpl(endpoint, trackId, parsedMetadata, simulcastConfig);

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

  public addRemoteEndpoint = (
    endpointId: string,
    metadataJson?: MetadataJson,
    tracks?: Record<RemoteTrackId, MediaEvent_Track>,
    sendNotification: boolean = true,
  ) => {
    const endpoint = {
      id: endpointId,
      type: 'exwebrtc',
      metadata: metadataJson ? JSON.parse(metadataJson) : undefined,
      tracks: new Map(),
    } satisfies EndpointWithTrackContext;

    this.addEndpoint(endpoint);
    this.addTracks(endpoint.id, tracks ?? {});

    if (sendNotification) {
      this.emit('endpointAdded', endpoint);
    }
  };

  private addEndpoint = (endpoint: EndpointWithTrackContext): void => {
    this.remoteEndpoints[endpoint.id] = endpoint;
  };

  public updateRemoteEndpoint = (endpointId: string, metadataJson?: MetadataJson) => {
    const endpoint: EndpointWithTrackContext | undefined = this.remoteEndpoints[endpointId];
    if (!endpoint) throw new Error(`Endpoint ${endpointId} not found`);

    endpoint.metadata = metadataJson ? JSON.parse(metadataJson) : undefined;

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

  public updateRemoteTrack = (endpointId: string, trackId: string, metadataJson?: MetadataJson) => {
    if (!this.remoteEndpoints[endpointId]) throw new Error(`Endpoint ${endpointId} not found`);

    const remoteTrack = this.remoteTracks[trackId];
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`);

    remoteTrack.trackContext.metadata = metadataJson ? JSON.parse(metadataJson) : undefined;

    this.emit('trackUpdated', remoteTrack.trackContext);
  };

  public disableRemoteTrackEncoding = (trackId: TrackId, encoding: Variant) => {
    const remoteTrack = this.remoteTracks[trackId];
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`);

    remoteTrack.disableTrackEncoding(encoding);

    this.emit('trackEncodingDisabled', remoteTrack.trackContext, encoding);
  };

  public enableRemoteTrackEncoding = (trackId: TrackId, encoding: Variant) => {
    const remoteTrack = this.remoteTracks[trackId];
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`);

    remoteTrack.enableTrackEncoding(encoding);

    this.emit('trackEncodingEnabled', remoteTrack.trackContext, encoding);
  };

  public setRemoteTrackEncoding = (trackId: TrackId, encoding: Variant, reason?: EncodingReason) => {
    const remoteTrack = this.remoteTracks[trackId];
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`);

    remoteTrack.trackContext.encoding = encoding;
    remoteTrack.trackContext.encodingReason = reason;

    remoteTrack.trackContext.emit('encodingChanged', remoteTrack.trackContext);
  };

  public setRemoteTrackVadStatus = (trackId: TrackId, vadStatus: MediaEvent_VadNotification_Status) => {
    const remoteTrack = this.remoteTracks[trackId];
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`);

    let nextStatus: VadStatus | null = null;

    if (vadStatus === MediaEvent_VadNotification_Status.STATUS_SILENCE) {
      nextStatus = 'silence';
    } else if (vadStatus === MediaEvent_VadNotification_Status.STATUS_SPEECH) {
      nextStatus = 'speech';
    }

    if (nextStatus) {
      remoteTrack.trackContext.vadStatus = nextStatus;
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

  public setTargetRemoteTrackEncoding = (trackId: TrackId, variant: Variant) => {
    const remoteTrack = this.remoteTracks[trackId];
    if (!remoteTrack) throw new Error(`Track ${trackId} not found`);

    try {
      remoteTrack.setTargetTrackEncoding(variant);

      const enableTrackVariant = MediaEvent_EnableTrackVariant.create({ variant, trackId });
      this.sendMediaEvent({ enableTrackVariant });
      this.emit('targetTrackEncodingRequested', {
        trackId,
        variant,
      });
    } catch (e) {
      console.warn(e);
    }
  };

  public updateMLineIds = (midToTrackIds: Record<string, string>) => {
    Object.entries(midToTrackIds).forEach(([mid, trackId]) => {
      this.remoteTracks[trackId]?.setMLineId(mid);
    });
  };
}
