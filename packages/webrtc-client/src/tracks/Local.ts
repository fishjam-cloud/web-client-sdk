import { LocalTrack } from './LocalTrack';
import type {
  BandwidthLimit,
  LocalTrackId,
  MetadataJson,
  MLineId,
  RemoteTrackId,
  TrackBandwidthLimit,
  WebRTCEndpointEvents,
} from '../types';
import type { EndpointWithTrackContext } from '../internal';
import { isTrackKind, TrackContextImpl } from '../internal';
import type { ConnectionManager } from '../ConnectionManager';
import type { EndpointId, TrackId } from './TrackCommon';
import type { WebRTCEndpoint } from '../webRTCEndpoint';
import type { MediaEvent_TrackBitrates, MediaEvent as PeerMediaEvent } from '@fishjam-cloud/protobufs/peer';
import {
  MediaEvent_SdpOffer,
  MediaEvent_RenegotiateTracks,
  MediaEvent_UpdateEndpointMetadata,
  MediaEvent_UpdateTrackMetadata,
} from '@fishjam-cloud/protobufs/peer';
import type { MediaEvent_Track_SimulcastConfig } from '@fishjam-cloud/protobufs/server';
import type { Variant } from '@fishjam-cloud/protobufs/shared';

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
  private readonly sendMediaEvent: (mediaEvent: PeerMediaEvent) => void;

  private connection: ConnectionManager | null = null;

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

  public updateSenders = () => {
    Object.values(this.localTracks).forEach((localTrack) => {
      localTrack.updateSender();
    });
  };

  public updateMLineIds = (midToTrackIds: Record<string, string>) => {
    Object.entries(midToTrackIds).forEach(([mid, trackId]) => {
      this.localTracks[trackId]?.setMLineId(mid);
    });
  };

  public updateConnection = (connection: ConnectionManager) => {
    this.connection = connection;

    Object.values(this.localTracks).forEach((track) => {
      track.updateConnection(connection);
    });
  };

  public createSdpOfferEvent = (sdpOffer: RTCSessionDescriptionInit): MediaEvent_SdpOffer => {
    const trackIdToMetadataJson = this.getTrackIdToMetadataJson();
    const trackIdToBitrates = this.getTrackIdToTrackBitrates();
    const midToTrackId = this.getMidToTrackId();

    return MediaEvent_SdpOffer.create({
      sdp: sdpOffer.sdp,
      midToTrackId,
      trackIdToBitrates,
      trackIdToMetadataJson,
    });
  };

  public addTrack = (
    connection: ConnectionManager | undefined,
    trackId: string,
    track: MediaStreamTrack,
    stream: MediaStream,
    trackMetadata: unknown | undefined,
    simulcastConfig: MediaEvent_Track_SimulcastConfig,
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

    const renegotiateTracks = MediaEvent_RenegotiateTracks.create({});
    this.sendMediaEvent({ renegotiateTracks });

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
    // const mediaEvent = trackManager.createTrackVariantBitratesEvent();

    // TODO add when simulcast is available
    // this.sendMediaEvent(mediaEvent);
    // this.emit('localTrackBandwidthSet', {
    //   trackId,
    //   bandwidth,
    // });
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

  public setEncodingBandwidth = async (trackId: TrackId, rid: Variant, bandwidth: BandwidthLimit): Promise<void> => {
    const trackManager = this.localTracks[trackId];
    if (!trackManager) throw new Error(`Cannot find ${trackId}`);

    await trackManager.setEncodingBandwidth(rid, bandwidth);

    // TODO add when simulcast is available
    // const mediaEvent = generateCustomEvent({
    //   type: 'trackVariantBitrates',
    //   data: {
    //     trackId: trackId,
    //     variantBitrates: trackManager.getTrackBitrates(),
    //   },
    // });
    // this.sendMediaEvent(mediaEvent);

    this.emit('localTrackEncodingBandwidthSet', {
      trackId,
      rid,
      bandwidth,
    });
  };

  public updateEndpointMetadata = (metadata: unknown) => {
    this.localEndpoint.metadata = metadata;

    const updateEndpointMetadata = MediaEvent_UpdateEndpointMetadata.create({
      metadataJson: JSON.stringify(this.localEndpoint.metadata),
    });

    this.sendMediaEvent({ updateEndpointMetadata });
    this.emit('localEndpointMetadataChanged', {
      metadata: this.localEndpoint.metadata,
    });
  };

  public updateLocalTrackMetadata = (trackId: TrackId, metadata: unknown) => {
    const trackManager = this.localTracks[trackId];
    if (!trackManager) throw new Error(`Cannot find ${trackId}`);

    trackManager.updateTrackMetadata(metadata);

    const trackContext = trackManager.trackContext;
    const updateTrackMetadata = MediaEvent_UpdateTrackMetadata.create({
      trackId,
      metadataJson: metadata ? JSON.stringify(metadata) : undefined,
    });

    switch (trackContext.negotiationStatus) {
      case 'done':
        this.sendMediaEvent({ updateTrackMetadata });

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

  public disableLocalTrackEncoding = async (trackId: string, encoding: Variant): Promise<void> => {
    const localTrack = this.localTracks[trackId];
    if (!localTrack) throw new Error(`Track ${trackId} not found`);

    await localTrack.disableTrackEncoding(encoding);

    // TODO add when simulcast is available
    // const mediaEvent = generateMediaEvent('disableTrackEncoding', {
    //   trackId: trackId,
    //   encoding: encoding,
    // });

    // this.sendMediaEvent(mediaEvent);
    this.emit('localTrackEncodingEnabled', {
      trackId,
      encoding,
    });
  };

  public enableLocalTrackEncoding = async (trackId: TrackId, encoding: Variant): Promise<void> => {
    const trackManager = this.localTracks[trackId];
    if (!trackManager) throw new Error(`Cannot find ${trackId}`);

    await trackManager.enableTrackEncoding(encoding);
    // TODO add when simulcast is available
    // const mediaEvent = generateMediaEvent('enableTrackEncoding', {
    //   trackId: trackId,
    //   encoding: encoding,
    // });

    // this.sendMediaEvent(mediaEvent);
    this.emit('localTrackEncodingEnabled', {
      trackId,
      encoding,
    });
  };

  private getTrackIdToMetadataJson = (): Record<LocalTrackId, MetadataJson> =>
    Object.values(this.localTracks).reduce(
      (acc, { id, trackContext }) => ({ ...acc, [id]: JSON.stringify(trackContext.metadata) }),
      {},
    );

  // TODO add bitrates
  private getTrackIdToTrackBitrates = (): Record<LocalTrackId, MediaEvent_TrackBitrates> =>
    Object.values(this.localTracks).reduce((acc, { id }) => ({ ...acc, [id]: { bitrate: 500 } }), {});

  private getMidToTrackId = (): Record<MLineId, LocalTrackId> => {
    if (!this.connection) return {};

    // - negotiated unmuted tracks: tracks added in previous negotiation, data is being transmitted
    // - not yet negotiated tracks: tracks added in this negotiation, data will be transmitted after successful negotiation
    const mappingFromTransceivers = this.getTransceiverMapping();

    // - negotiated unmuted tracks: tracks added in previous negotiation, data is being transmitted
    // - negotiated muted tracks: tracks added in previous negotiation, data is not being transmitted but can be transmitted in the future
    const mappingFromLocalNegotiatedTracks = Object.values(this.localTracks)
      .filter((track): track is LocalTrack & { mLineId: string } => !!track.mLineId)
      .reduce((acc, { id, mLineId }) => ({ ...acc, [mLineId]: id }), {});

    return { ...mappingFromTransceivers, ...mappingFromLocalNegotiatedTracks };
  };

  private getTransceiverMapping = (): Record<MLineId, LocalTrackId> => {
    if (!this.connection) return {};

    return this.connection
      .getConnection()
      .getTransceivers()
      .filter((transceiver) => Boolean(transceiver.sender.track?.id && transceiver.mid))
      .reduce((acc, { sender, mid }) => {
        const localTrack = Object.values(this.localTracks).find(
          (track) => track.mediaStreamTrackId === sender.track!.id,
        );
        if (!localTrack) throw new Error('Local track not found');

        return { ...acc, [mid!]: localTrack.id };
      }, {});
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
