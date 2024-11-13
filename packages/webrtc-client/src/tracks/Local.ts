import { LocalTrack } from './LocalTrack';
import type {
  BandwidthLimit,
  Encoding,
  MLineId,
  RemoteTrackId,
  SimulcastConfig,
  TrackBandwidthLimit,
  WebRTCEndpointEvents,
} from '../types';
import type { EndpointWithTrackContext } from '../internal';
import { isTrackKind, TrackContextImpl } from '../internal';
import type { MediaEvent } from '../mediaEvent';
import { generateCustomEvent, generateMediaEvent } from '../mediaEvent';
import type { ConnectionManager } from '../ConnectionManager';
import type { Bitrates } from '../bitrate';
import type { EndpointId, TrackId } from './TrackCommon';
import type { WebRTCEndpoint } from '../webRTCEndpoint';

export type MidToTrackId = Record<MLineId, TrackId>;

/**
 * This class encapsulates methods related to handling the list of local tracks and local endpoint.
 * It stores and mutates part of the client state for this local peer.
 * It emits local events for local tracks and endpoints,
 * and delegates mutation logic to the appropriate `LocalTrack` objects.
 * It's responsible for creating `MidToTrackId` record which is required in `sdpOffer`
 */
export class Local {
  private readonly localTracks: Record<TrackId, LocalTrack> = {};
  private readonly localEndpoint: EndpointWithTrackContext = {
    id: '',
    type: 'webrtc',
    metadata: undefined,
    tracks: new Map(),
  };

  private readonly emit: <E extends keyof Required<WebRTCEndpointEvents>>(
    event: E,
    ...args: Parameters<Required<WebRTCEndpointEvents>[E]>
  ) => void;
  private readonly sendMediaEvent: (mediaEvent: MediaEvent) => void;

  private connection: ConnectionManager | null = null;

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

  public updateSenders = () => {
    Object.values(this.localTracks).forEach((localTrack) => {
      localTrack.updateSender();
    });
  };

  public updateMLineIds = (midToTrackId: MidToTrackId) => {
    Object.entries(midToTrackId).forEach(([mLineId, trackId]) => {
      const localTrack = this.localTracks[trackId];
      if (localTrack) {
        localTrack.setMLineId(mLineId);
      }
    });
  };

  public updateConnection = (connection: ConnectionManager) => {
    this.connection = connection;

    Object.values(this.localTracks).forEach((track) => {
      track.updateConnection(connection);
    });
  };

  public createSdpOfferEvent = (offer: RTCSessionDescriptionInit): MediaEvent => {
    const trackIdToTrackMetadata = this.getTrackIdToMetadata();
    const trackIdToTrackBitrates = this.getTrackIdToTrackBitrates();
    const midToTrackId = this.getMidToTrackId();

    return generateCustomEvent({
      type: 'sdpOffer',
      data: {
        sdpOffer: offer,
        trackIdToTrackMetadata,
        trackIdToTrackBitrates,
        midToTrackId,
      },
    });
  };

  public addTrack = (
    connection: ConnectionManager | undefined,
    trackId: string,
    track: MediaStreamTrack,
    stream: MediaStream,
    trackMetadata: unknown | undefined,
    simulcastConfig: SimulcastConfig,
    maxBandwidth: TrackBandwidthLimit,
  ): LocalTrack => {
    const trackContext = new TrackContextImpl(this.localEndpoint, trackId, trackMetadata, simulcastConfig);

    trackContext.track = track;
    trackContext.stream = stream;
    trackContext.maxBandwidth = maxBandwidth;

    if (!isTrackKind(track.kind)) throw new Error('Track has no kind');
    trackContext.trackKind = track.kind;

    this.localEndpoint.tracks.set(trackId, trackContext);

    const trackManager = new LocalTrack(connection, trackId, trackContext);
    this.localTracks[trackId] = trackManager;
    return trackManager;
  };

  public getTrackByMidOrNull = (mid: string): LocalTrack | null => {
    return Object.values(this.localTracks).find((track) => track.mLineId === mid) ?? null;
  };

  public removeTrack = (trackId: TrackId) => {
    const trackManager = this.localTracks[trackId];
    if (!trackManager) throw new Error(`Cannot find ${trackId}`);

    trackManager.removeFromConnection();

    const mediaEvent = generateCustomEvent({ type: 'renegotiateTracks' });
    this.sendMediaEvent(mediaEvent);

    this.localEndpoint.tracks.delete(trackId);
    delete this.localTracks[trackId];
  };

  public replaceTrack = async (webrtc: WebRTCEndpoint, trackId: TrackId, newTrack: MediaStreamTrack | null) => {
    // TODO add validation to track.kind, you cannot replace video with audio

    const trackManager = this.localTracks[trackId];
    if (!trackManager) throw new Error(`Cannot find ${trackId}`);

    await trackManager.replaceTrack(newTrack, webrtc);
  };

  public setEndpointMetadata = (metadata: unknown) => {
    this.localEndpoint.metadata = metadata;
  };

  public getEndpoint = (): EndpointWithTrackContext => {
    return this.localEndpoint;
  };

  public setTrackBandwidth = async (trackId: string, bandwidth: BandwidthLimit): Promise<void> => {
    // FIXME: maxBandwidth in TrackContext is not updated

    const trackManager = this.localTracks[trackId];
    if (!trackManager) throw new Error(`Cannot find ${trackId}`);

    await trackManager.setTrackBandwidth(bandwidth);
    const mediaEvent = trackManager.createTrackVariantBitratesEvent();

    this.sendMediaEvent(mediaEvent);
    this.emit('localTrackBandwidthSet', {
      trackId,
      bandwidth,
    });
  };

  public getTrackIdToTrack = (): Map<RemoteTrackId, TrackContextImpl> => {
    const entries: [string, TrackContextImpl][] = Object.values(this.localTracks).map(
      (track) => [track.id, track.trackContext] as const,
    );
    return new Map(entries);
  };

  public setLocalEndpointId = (endpointId: EndpointId) => {
    this.localEndpoint.id = endpointId;
  };

  public setEncodingBandwidth = async (trackId: TrackId, rid: Encoding, bandwidth: BandwidthLimit): Promise<void> => {
    const trackManager = this.localTracks[trackId];
    if (!trackManager) throw new Error(`Cannot find ${trackId}`);

    await trackManager.setEncodingBandwidth(rid, bandwidth);

    const mediaEvent = generateCustomEvent({
      type: 'trackVariantBitrates',
      data: {
        trackId: trackId,
        variantBitrates: trackManager.getTrackBitrates(),
      },
    });
    this.sendMediaEvent(mediaEvent);

    this.emit('localTrackEncodingBandwidthSet', {
      trackId,
      rid,
      bandwidth,
    });
  };

  public updateEndpointMetadata = (metadata: unknown) => {
    this.localEndpoint.metadata = metadata;

    const mediaEvent = generateMediaEvent('updateEndpointMetadata', {
      metadata: this.localEndpoint.metadata,
    });
    this.sendMediaEvent(mediaEvent);
    this.emit('localEndpointMetadataChanged', {
      metadata: this.localEndpoint.metadata,
    });
  };

  public updateLocalTrackMetadata = (trackId: TrackId, metadata: unknown) => {
    const trackManager = this.localTracks[trackId];
    if (!trackManager) throw new Error(`Cannot find ${trackId}`);

    trackManager.updateTrackMetadata(metadata);

    const trackContext = trackManager.trackContext;

    const mediaEvent = generateMediaEvent('updateTrackMetadata', {
      trackId,
      trackMetadata: metadata,
    });

    switch (trackContext.negotiationStatus) {
      case 'done':
        this.sendMediaEvent(mediaEvent);

        this.emit('localTrackMetadataChanged', {
          trackId,
          metadata: trackContext.metadata!,
        });
        break;

      case 'offered':
        trackContext.pendingMetadataUpdate = true;
        break;

      case 'awaiting':
        // We don't need to do anything
        break;
    }
  };

  public disableLocalTrackEncoding = async (trackId: string, encoding: Encoding): Promise<void> => {
    const localTrack = this.localTracks[trackId];
    if (!localTrack) throw new Error(`Track ${trackId} not found`);

    await localTrack.disableTrackEncoding(encoding);

    const mediaEvent = generateMediaEvent('disableTrackEncoding', {
      trackId: trackId,
      encoding: encoding,
    });

    this.sendMediaEvent(mediaEvent);
    this.emit('localTrackEncodingEnabled', {
      trackId,
      encoding,
    });
  };

  public enableLocalTrackEncoding = async (trackId: TrackId, encoding: Encoding): Promise<void> => {
    const trackManager = this.localTracks[trackId];
    if (!trackManager) throw new Error(`Cannot find ${trackId}`);

    await trackManager.enableTrackEncoding(encoding);

    const mediaEvent = generateMediaEvent('enableTrackEncoding', {
      trackId: trackId,
      encoding: encoding,
    });

    this.sendMediaEvent(mediaEvent);
    this.emit('localTrackEncodingEnabled', {
      trackId,
      encoding,
    });
  };

  private getTrackIdToMetadata = (): Record<TrackId, unknown | undefined> => {
    return Object.values(this.localTracks).reduce(
      (previousValue, localTrack) => ({
        ...previousValue,
        [localTrack.id]: localTrack.trackContext.metadata,
      }),
      {} as Record<TrackId, unknown | undefined>,
    );
  };

  private getTrackIdToTrackBitrates = (): Record<TrackId, Bitrates> => {
    return Object.values(this.localTracks).reduce(
      (previousValue, localTrack) => {
        const bitrates = localTrack.getTrackBitrates();
        if (bitrates) {
          return {
            ...previousValue,
            [localTrack.id]: bitrates,
          };
        }
        return previousValue;
      },
      {} as Record<TrackId, Bitrates>,
    );
  };

  private getMidToTrackId = (): MidToTrackId | null => {
    if (!this.connection) return null;

    // - negotiated unmuted tracks: tracks added in previous negotiation, data is being transmitted
    // - not yet negotiated tracks: tracks added in this negotiation, data will be transmitted after successful negotiation
    const mappingFromTransceivers = this.getTransceiverMapping();

    // - negotiated unmuted tracks: tracks added in previous negotiation, data is being transmitted
    // - negotiated muted tracks: tracks added in previous negotiation, data is not being transmitted but can be transmitted in the future
    const mappingFromLocalNegotiatedTracks = Object.values(this.localTracks).reduce((acc, curr) => {
      if (curr.mLineId) {
        acc[curr.mLineId] = curr.id;
      }

      return acc;
    }, {} as MidToTrackId);

    return { ...mappingFromTransceivers, ...mappingFromLocalNegotiatedTracks };
  };

  private getTransceiverMapping = (): MidToTrackId => {
    if (!this.connection) return {};

    return this.connection
      .getConnection()
      .getTransceivers()
      .filter((transceiver) => transceiver.sender.track?.id && transceiver.mid)
      .reduce((acc, transceiver) => {
        const localTrackId = transceiver.sender.track!.id;
        const mid = transceiver!.mid!;

        const localTrack = Object.values(this.localTracks).find((track) => track.mediaStreamTrackId === localTrackId);

        if (!localTrack) throw new Error('Local track not found');

        acc[mid] = localTrack.trackContext.trackId;

        return acc;
      }, {} as MidToTrackId);
  };

  public setLocalTrackStatusToOffered = () => {
    Object.values(this.localTracks).forEach((localTrack) => {
      localTrack.trackContext.negotiationStatus = 'offered';
    });
  };

  public addAllTracksToConnection = () => {
    Object.values(this.localTracks).forEach((localTrack) => {
      localTrack.addTrackToConnection();
    });
  };
}
