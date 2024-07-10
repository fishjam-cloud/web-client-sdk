import type {
  LocalTrackId,
  MetadataParser,
  RemoteTrackId,
  SimulcastConfig,
  TrackBandwidthLimit,
  TrackEncoding,
} from './types';
import type { EndpointWithTrackContext } from './internal';
import {
  isTrackKind,
  mapMediaEventTracksToTrackContextImpl,
  TrackContextImpl,
} from './internal';
import {
  findSender,
  findSenderByTrack,
  isTrackInUse,
} from './RTCPeerConnectionUtils';
import { generateCustomEvent, generateMediaEvent } from './mediaEvent';
import type { WebRTCEndpoint } from './webRTCEndpoint';
import { isVadStatus } from './voiceActivityDetection';
import type { NegotiationManager } from './NegotiationManager';
import { addTrackToConnection, setTransceiverDirection } from './transciever';

export class StateManager<EndpointMetadata, TrackMetadata> {
  public trackIdToTrack: Map<
    string,
    TrackContextImpl<EndpointMetadata, TrackMetadata>
  > = new Map();
  public connection?: RTCPeerConnection;
  public idToEndpoint: Map<
    string,
    EndpointWithTrackContext<EndpointMetadata, TrackMetadata>
  > = new Map();
  public localEndpoint: EndpointWithTrackContext<
    EndpointMetadata,
    TrackMetadata
  > = {
    id: '',
    type: 'webrtc',
    metadata: undefined,
    rawMetadata: undefined,
    tracks: new Map(),
  };
  public localTrackIdToTrack: Map<
    RemoteTrackId,
    TrackContextImpl<EndpointMetadata, TrackMetadata>
  > = new Map();
  public trackIdToSender: Map<
    RemoteTrackId,
    {
      remoteTrackId: RemoteTrackId;
      localTrackId: LocalTrackId | null;
      sender: RTCRtpSender | null;
    }
  > = new Map();
  public midToTrackId: Map<string, string> = new Map();
  public disabledTrackEncodings: Map<string, TrackEncoding[]> = new Map();
  public rtcConfig: RTCConfiguration = {
    bundlePolicy: 'max-bundle',
    iceServers: [],
    iceTransportPolicy: 'relay',
  };
  public bandwidthEstimation: bigint = BigInt(0);

  public ongoingTrackReplacement: boolean = false;

  // temporary for webrtc.emit and webrtc.sendMediaEvent
  private readonly webrtc: WebRTCEndpoint<EndpointMetadata, TrackMetadata>;
  private readonly negotiationManager: NegotiationManager;
  private readonly endpointMetadataParser: MetadataParser<EndpointMetadata>;
  private readonly trackMetadataParser: MetadataParser<TrackMetadata>;

  constructor(
    webrtc: WebRTCEndpoint<EndpointMetadata, TrackMetadata>,
    negotiationManager: NegotiationManager,
    endpointMetadataParser: MetadataParser<EndpointMetadata>,
    trackMetadataParser: MetadataParser<TrackMetadata>,
  ) {
    this.webrtc = webrtc;
    this.negotiationManager = negotiationManager;
    this.endpointMetadataParser = endpointMetadataParser;
    this.trackMetadataParser = trackMetadataParser;
  }

  private onAnswer = async (answer: RTCSessionDescriptionInit) => {
    this.connection!.ontrack = this.onTrack();
    try {
      await this.connection!.setRemoteDescription(answer);
      this.disabledTrackEncodings.forEach(
        (encodings: TrackEncoding[], trackId: string) => {
          encodings.forEach((encoding: TrackEncoding) =>
            this.disableTrackEncoding(trackId, encoding),
          );
        },
      );
    } catch (err) {
      console.error(err);
    }
  };

  /**
   * Disables track encoding so that it will be no longer sent to the server.
   * @param {string} trackId - id of track
   * @param {TrackEncoding} encoding - encoding that will be disabled
   * @example
   * ```ts
   * const trackId = webrtc.addTrack(track, stream, {}, {enabled: true, activeEncodings: ["l", "m", "h"]});
   * webrtc.disableTrackEncoding(trackId, "l");
   * ```
   */
  public disableTrackEncoding = (trackId: string, encoding: TrackEncoding) => {
    const track = this.localTrackIdToTrack.get(trackId)?.track;
    this.disabledTrackEncodings.get(trackId)!.push(encoding);

    const sender = findSenderByTrack(this.connection, track);

    const params = sender?.getParameters();
    params!.encodings.filter((en) => en.rid == encoding)[0].active = false;
    sender?.setParameters(params!);

    const mediaEvent = generateMediaEvent('disableTrackEncoding', {
      trackId: trackId,
      encoding: encoding,
    });
    this.webrtc.sendMediaEvent(mediaEvent);
    this.webrtc.emit('localTrackEncodingDisabled', {
      trackId,
      encoding,
    });
  };

  private onTrack = () => {
    return (event: RTCTrackEvent) => {
      const [stream] = event.streams;
      const mid = event.transceiver.mid!;

      const trackId = this.midToTrackId.get(mid)!;

      if (this.checkIfTrackBelongToEndpoint(trackId, this.localEndpoint))
        return;
      if (!isTrackKind(event.track.kind)) throw new Error('Track has no kind');

      const trackContext = this.trackIdToTrack.get(trackId)!;

      trackContext.stream = stream;
      trackContext.track = event.track;
      trackContext.trackKind = event.track.kind;

      this.idToEndpoint
        .get(trackContext.endpoint.id)
        ?.tracks.set(trackId, trackContext);

      this.webrtc.emit('trackReady', trackContext);
    };
  };

  private checkIfTrackBelongToEndpoint = (
    trackId: string,
    endpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata>,
  ) =>
    Array.from(endpoint.tracks.keys()).some((track) =>
      trackId.startsWith(track),
    );

  public onTracksAdded = (data: any) => {
    if (this.getEndpointId() === data.endpointId) return;
    data.tracks = new Map<string, any>(Object.entries(data.tracks));
    const endpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata> =
      this.idToEndpoint.get(data.endpointId)!;
    const oldTracks = endpoint.tracks;

    data.tracks = mapMediaEventTracksToTrackContextImpl(
      data.tracks,
      endpoint,
      this.trackMetadataParser,
    );

    endpoint.tracks = new Map([...endpoint.tracks, ...data.tracks]);

    this.idToEndpoint.set(endpoint.id, endpoint);
    Array.from(endpoint.tracks.entries()).forEach(([trackId, ctx]) => {
      if (!oldTracks.has(trackId)) {
        this.trackIdToTrack.set(trackId, ctx);

        this.webrtc.emit('trackAdded', ctx);
      }
    });
  };

  public onTracksRemoved = (data: any) => {
    const endpointId = data.endpointId;
    if (this.getEndpointId() === endpointId) return;
    const trackIds = data.trackIds as string[];
    trackIds.forEach((trackId) => {
      const trackContext = this.trackIdToTrack.get(trackId)!;

      this.eraseTrack(trackId, endpointId);

      this.webrtc.emit('trackRemoved', trackContext);
    });
  };

  public onSdpAnswer = (data: any) => {
    this.midToTrackId = new Map(Object.entries(data.midToTrackId));

    for (const trackId of Object.values(data.midToTrackId)) {
      const trackContext = this.localTrackIdToTrack.get(trackId as string);

      // if is local trackContext
      if (trackContext) {
        trackContext.negotiationStatus = 'done';

        if (trackContext.pendingMetadataUpdate) {
          const mediaEvent = generateMediaEvent('updateTrackMetadata', {
            trackId,
            trackMetadata: trackContext.metadata,
          });
          this.webrtc.sendMediaEvent(mediaEvent);
        }

        trackContext.pendingMetadataUpdate = false;
      }
    }

    this.onAnswer(data);
  };

  public onEndpointAdded = (
    endpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata>,
  ) => {
    if (endpoint.id === this.getEndpointId()) return;
    endpoint.rawMetadata = endpoint.metadata;
    try {
      endpoint.metadataParsingError = undefined;
      endpoint.metadata = this.endpointMetadataParser(endpoint.rawMetadata);
    } catch (error) {
      endpoint.metadataParsingError = error;
      endpoint.metadata = undefined;
    }
    this.addEndpoint(endpoint);

    this.webrtc.emit('endpointAdded', endpoint);
  };

  public onEndpointUpdated = (data: any) => {
    if (this.getEndpointId() === data.id) return;
    const endpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata> =
      this.idToEndpoint.get(data.id)!;

    try {
      endpoint.metadata = this.endpointMetadataParser(data.metadata);
      endpoint.metadataParsingError = undefined;
    } catch (error) {
      endpoint.metadata = undefined;
      endpoint.metadataParsingError = error;
    }
    endpoint.rawMetadata = data.metadata;
    this.addEndpoint(endpoint);

    this.webrtc.emit('endpointUpdated', endpoint);
  };

  public onEndpointRemoved = (data: any) => {
    const endpoint:
      | EndpointWithTrackContext<EndpointMetadata, TrackMetadata>
      | undefined = this.idToEndpoint.get(data.id);
    if (!endpoint) return;

    Array.from(endpoint.tracks.keys()).forEach((trackId) => {
      this.webrtc.emit('trackRemoved', this.trackIdToTrack.get(trackId)!);
    });

    this.eraseEndpoint(endpoint);

    this.webrtc.emit('endpointRemoved', endpoint);
  };

  public onTrackUpdated = (data: any) => {
    if (this.getEndpointId() === data.endpointId) return;

    const endpoint:
      | EndpointWithTrackContext<EndpointMetadata, TrackMetadata>
      | undefined = this.idToEndpoint.get(data.endpointId);

    if (!endpoint) throw `Endpoint with id: ${data.endpointId} doesn't exist`;

    const trackId = data.trackId;
    const trackMetadata = data.metadata;
    let newTrack = endpoint.tracks.get(trackId)!;
    const trackContext = this.trackIdToTrack.get(trackId)!;

    try {
      const parsedMetadata = this.trackMetadataParser(trackMetadata);
      newTrack = {
        ...newTrack,
        metadata: parsedMetadata,
        metadataParsingError: undefined,
      };
      trackContext.metadata = parsedMetadata;
      trackContext.metadataParsingError = undefined;
    } catch (error) {
      newTrack = {
        ...newTrack,
        metadata: undefined,
        metadataParsingError: error,
      };
      trackContext.metadataParsingError = error;
      trackContext.metadata = undefined;
    }
    newTrack = { ...newTrack, rawMetadata: trackMetadata };
    trackContext.rawMetadata = trackMetadata;
    endpoint.tracks.set(trackId, newTrack);

    this.webrtc.emit('trackUpdated', trackContext);
  };

  public onTrackEncodingDisabled = (data: any) => {
    if (this.getEndpointId() === data.endpointId) return;

    const endpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata> =
      this.idToEndpoint.get(data.endpointId)!;

    if (!endpoint) throw `Endpoint with id: ${data.endpointId} doesn't exist`;

    const trackId = data.trackId;
    const encoding = data.encoding;

    const trackContext = endpoint.tracks.get(trackId)!;

    this.webrtc.emit('trackEncodingDisabled', trackContext, encoding);
  };

  public onTrackEncodingEnabled = (data: any) => {
    if (this.getEndpointId() === data.endpointId) return;

    const endpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata> =
      this.idToEndpoint.get(data.endpointId)!;

    if (!endpoint) throw `Endpoint with id: ${data.endpointId} doesn't exist`;

    const trackId = data.trackId;
    const encoding = data.encoding;

    const trackContext = endpoint.tracks.get(trackId)!;

    this.webrtc.emit('trackEncodingEnabled', trackContext, encoding);
  };

  public onEncodingSwitched = (data: any) => {
    const trackId = data.trackId;
    const trackContext = this.trackIdToTrack.get(trackId)!;
    trackContext.encoding = data.encoding;
    trackContext.encodingReason = data.reason;

    trackContext.emit('encodingChanged', trackContext);
  };

  public onVadNotification = (data: any) => {
    const trackId = data.trackId;
    const trackContext = this.trackIdToTrack.get(trackId)!;

    const vadStatus = data.status;
    if (isVadStatus(vadStatus)) {
      trackContext.vadStatus = vadStatus;
      trackContext.emit('voiceActivityChanged', trackContext);
    } else {
      console.warn('Received unknown vad status: ', vadStatus);
    }
  };

  public onBandwidthEstimation = (data: any) => {
    this.bandwidthEstimation = data.estimation;

    this.webrtc.emit('bandwidthEstimationChanged', this.bandwidthEstimation);
  };

  public validateAddTrack = (
    track: MediaStreamTrack,
    simulcastConfig: SimulcastConfig,
    maxBandwidth: TrackBandwidthLimit,
  ): string | null => {
    if (this.getEndpointId() === '') {
      return 'Cannot add tracks before being accepted by the server';
    }

    if (!simulcastConfig.enabled && !(typeof maxBandwidth === 'number')) {
      return 'Invalid type of `maxBandwidth` argument for a non-simulcast track, expected: number';
    }

    if (isTrackInUse(this.connection, track)) {
      return "This track was already added to peerConnection, it can't be added again!";
    }

    return null;
  };

  public addTrackHandler = (
    trackId: string,
    track: MediaStreamTrack,
    stream: MediaStream,
    trackMetadata: TrackMetadata | undefined,
    simulcastConfig: SimulcastConfig,
    maxBandwidth: TrackBandwidthLimit,
  ) => {
    this.negotiationManager.ongoingRenegotiation = true;

    const trackContext = new TrackContextImpl(
      this.localEndpoint,
      trackId,
      trackMetadata,
      simulcastConfig,
      this.trackMetadataParser,
    );

    if (!isTrackKind(track.kind)) throw new Error('Track has no kind');

    trackContext.track = track;
    trackContext.stream = stream;
    trackContext.maxBandwidth = maxBandwidth;
    trackContext.trackKind = track.kind;

    this.localEndpoint.tracks.set(trackId, trackContext);

    this.localTrackIdToTrack.set(trackId, trackContext);

    if (this.connection) {
      addTrackToConnection(
        trackContext,
        this.disabledTrackEncodings,
        this.connection,
      );

      setTransceiverDirection(this.connection);
    }

    this.trackIdToSender.set(trackId, {
      remoteTrackId: trackId,
      localTrackId: track.id,
      sender: null,
    });
    const mediaEvent = generateCustomEvent({ type: 'renegotiateTracks' });
    this.webrtc.sendMediaEvent(mediaEvent);
  };

  public removeTrackHandler = (trackId: string) => {
    const trackContext = this.localTrackIdToTrack.get(trackId)!;
    const sender = findSender(this.connection, trackContext.track!.id);

    this.negotiationManager.ongoingRenegotiation = true;

    this.connection!.removeTrack(sender);
    const mediaEvent = generateCustomEvent({ type: 'renegotiateTracks' });
    this.webrtc.sendMediaEvent(mediaEvent);
    this.localTrackIdToTrack.delete(trackId);
    this.localEndpoint.tracks.delete(trackId);
  };

  public replaceTrackHandler = async (
    trackId: string,
    newTrack: MediaStreamTrack | null,
    newTrackMetadata?: TrackMetadata,
  ): Promise<void> => {
    // todo add validation to track.kind, you cannot replace video with audio

    const trackContext = this.localTrackIdToTrack.get(trackId)!;

    const track = this.trackIdToSender.get(trackId);
    const sender = track?.sender ?? null;

    if (!track) throw Error(`There is no track with id: ${trackId}`);
    if (!sender) throw Error('There is no RTCRtpSender for this track id!');

    this.ongoingTrackReplacement = true;

    trackContext.stream?.getTracks().forEach((track) => {
      trackContext.stream?.removeTrack(track);
    });

    if (newTrack) {
      trackContext.stream?.addTrack(newTrack);
    }

    if (trackContext.track && !newTrack) {
      const mediaEvent = generateMediaEvent('muteTrack', { trackId: trackId });
      this.webrtc.sendMediaEvent(mediaEvent);
      this.webrtc.emit('localTrackMuted', { trackId: trackId });
    } else if (!trackContext.track && newTrack) {
      const mediaEvent = generateMediaEvent('unmuteTrack', {
        trackId: trackId,
      });
      this.webrtc.sendMediaEvent(mediaEvent);
      this.webrtc.emit('localTrackUnmuted', { trackId: trackId });
    }

    track.localTrackId = newTrack?.id ?? null;

    try {
      await sender.replaceTrack(newTrack);
      trackContext.track = newTrack;

      if (newTrackMetadata) {
        this.webrtc.updateTrackMetadata(trackId, newTrackMetadata);
      }
    } catch (error) {
      // ignore
    } finally {
      // this.resolvePreviousCommand();
      this.ongoingTrackReplacement = false;
      // this.processNextCommand();
    }
  };

  private addEndpoint = (
    endpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata>,
  ): void => {
    // #TODO remove this line after fixing deserialization
    if (Object.prototype.hasOwnProperty.call(endpoint, 'trackIdToMetadata'))
      endpoint.tracks = new Map(Object.entries(endpoint.tracks));
    else endpoint.tracks = new Map();

    this.idToEndpoint.set(endpoint.id, endpoint);
  };

  private eraseEndpoint = (
    endpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata>,
  ): void => {
    const tracksId = Array.from(endpoint.tracks.keys());
    tracksId.forEach((trackId) => this.trackIdToTrack.delete(trackId));
    Array.from(this.midToTrackId.entries()).forEach(([mid, trackId]) => {
      if (tracksId.includes(trackId)) this.midToTrackId.delete(mid);
    });
    this.idToEndpoint.delete(endpoint.id);
  };

  private eraseTrack = (trackId: string, endpointId: string) => {
    this.trackIdToTrack.delete(trackId);
    const midToTrackId = Array.from(this.midToTrackId.entries());
    const [mid, _trackId] = midToTrackId.find(
      ([_mid, mapTrackId]) => mapTrackId === trackId,
    )!;
    this.midToTrackId.delete(mid);
    this.idToEndpoint.get(endpointId)!.tracks.delete(trackId);
    this.disabledTrackEncodings.delete(trackId);
  };

  public getEndpointId = () => this.localEndpoint.id;
}
