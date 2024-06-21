import {
  deserializeMediaEvent,
  generateCustomEvent,
  generateMediaEvent,
  MediaEvent,
  SerializedMediaEvent,
  serializeMediaEvent,
} from './mediaEvent';
import { v4 as uuidv4 } from 'uuid';
import EventEmitter from 'events';
import TypedEmitter from 'typed-emitter';
import { simulcastTransceiverConfig } from './const';
import {
  AddTrackCommand,
  Command,
  RemoveTrackCommand,
  ReplaceTackCommand,
} from './commands';
import { Deferred } from './deferred';
import {
  BandwidthLimit,
  Config,
  LocalTrackId,
  MetadataParser,
  RemoteTrackId,
  SimulcastConfig,
  TrackBandwidthLimit,
  TrackContext,
  TrackEncoding,
  WebRTCEndpointEvents,
} from './types';
import { EndpointWithTrackContext, TrackContextImpl } from './internal';
import { handleVoiceActivationDetectionNotification } from './voiceActivityDetection';
import { applyBandwidthLimitation } from './bandwidth';
import {
  createTrackVariantBitratesEvent,
  getTrackBitrates,
  getTrackIdToTrackBitrates,
} from './bitrate';

/**
 * Main class that is responsible for connecting to the RTC Engine, sending and receiving media.
 */
export class WebRTCEndpoint<
  EndpointMetadata = any,
  TrackMetadata = any,
> extends (EventEmitter as {
  new <EndpointMetadata, TrackMetadata>(): TypedEmitter<
    Required<WebRTCEndpointEvents<EndpointMetadata, TrackMetadata>>
  >;
})<EndpointMetadata, TrackMetadata> {
  private trackIdToTrack: Map<
    string,
    TrackContextImpl<EndpointMetadata, TrackMetadata>
  > = new Map();
  private connection?: RTCPeerConnection;
  private idToEndpoint: Map<
    string,
    EndpointWithTrackContext<EndpointMetadata, TrackMetadata>
  > = new Map();
  private localEndpoint: EndpointWithTrackContext<
    EndpointMetadata,
    TrackMetadata
  > = {
    id: '',
    type: 'webrtc',
    metadata: undefined,
    rawMetadata: undefined,
    tracks: new Map(),
  };
  private localTrackIdToTrack: Map<
    RemoteTrackId,
    TrackContextImpl<EndpointMetadata, TrackMetadata>
  > = new Map();
  private trackIdToSender: Map<
    RemoteTrackId,
    {
      remoteTrackId: RemoteTrackId;
      localTrackId: LocalTrackId | null;
      sender: RTCRtpSender | null;
    }
  > = new Map();
  private midToTrackId: Map<string, string> = new Map();
  private disabledTrackEncodings: Map<string, TrackEncoding[]> = new Map();
  private rtcConfig: RTCConfiguration = {
    bundlePolicy: 'max-bundle',
    iceServers: [],
    iceTransportPolicy: 'relay',
  };
  private bandwidthEstimation: bigint = BigInt(0);

  /**
   * Indicates if an ongoing renegotiation is active.
   * During renegotiation, both parties are expected to actively exchange events: renegotiateTracks, offerData, sdpOffer, sdpAnswer.
   */
  private ongoingRenegotiation: boolean = false;
  private ongoingTrackReplacement: boolean = false;
  private commandsQueue: Command<TrackMetadata>[] = [];
  private commandResolutionNotifier: Deferred<void> | null = null;

  private readonly endpointMetadataParser: MetadataParser<EndpointMetadata>;
  private readonly trackMetadataParser: MetadataParser<TrackMetadata>;

  constructor(config?: Config<EndpointMetadata, TrackMetadata>) {
    super();
    this.endpointMetadataParser =
      config?.endpointMetadataParser ?? ((x) => x as EndpointMetadata);
    this.trackMetadataParser =
      config?.trackMetadataParser ?? ((x) => x as TrackMetadata);
  }

  /**
   * Tries to connect to the RTC Engine. If user is successfully connected then {@link WebRTCEndpointEvents.connected}
   * will be emitted.
   *
   * @param metadata - Any information that other endpoints will receive in {@link WebRTCEndpointEvents.endpointAdded}
   * after accepting this endpoint
   *
   * @example
   * ```ts
   * let webrtc = new WebRTCEndpoint();
   * webrtc.connect({displayName: "Bob"});
   * ```
   */
  public connect = (metadata: EndpointMetadata): void => {
    try {
      this.localEndpoint.metadata = this.endpointMetadataParser(metadata);
      this.localEndpoint.metadataParsingError = undefined;
    } catch (error) {
      this.localEndpoint.metadata = undefined;
      this.localEndpoint.metadataParsingError = error;
      throw error;
    }
    this.localEndpoint.rawMetadata = metadata;
    const mediaEvent = generateMediaEvent('connect', {
      metadata: this.localEndpoint.metadata,
    });
    this.sendMediaEvent(mediaEvent);
  };

  /**
   * Feeds media event received from RTC Engine to {@link WebRTCEndpoint}.
   * This function should be called whenever some media event from RTC Engine
   * was received and can result in {@link WebRTCEndpoint} generating some other
   * media events.
   *
   * @param mediaEvent - String data received over custom signalling layer.
   *
   * @example
   * This example assumes phoenix channels as signalling layer.
   * As phoenix channels require objects, RTC Engine encapsulates binary data into
   * map with one field that is converted to object with one field on the TS side.
   * ```ts
   * webrtcChannel.on("mediaEvent", (event) => webrtc.receiveMediaEvent(event.data));
   * ```
   */
  public receiveMediaEvent = (mediaEvent: SerializedMediaEvent) => {
    const deserializedMediaEvent = deserializeMediaEvent(mediaEvent);
    switch (deserializedMediaEvent.type) {
      case 'connected': {
        this.localEndpoint.id = deserializedMediaEvent.data.id;

        const endpoints: any[] = deserializedMediaEvent.data.otherEndpoints;

        const otherEndpoints: EndpointWithTrackContext<
          EndpointMetadata,
          TrackMetadata
        >[] = endpoints.map((endpoint) => {
          const tracks = this.mapMediaEventTracksToTrackContextImpl(
            new Map<string, TrackContext<EndpointMetadata, TrackMetadata>>(
              Object.entries(endpoint.tracks),
            ),
            endpoint,
          );

          try {
            return {
              id: endpoint.id,
              type: endpoint.type,
              metadata: this.endpointMetadataParser(endpoint.metadata),
              rawMetadata: endpoint.metadata,
              metadataParsingError: undefined,
              tracks,
            } satisfies EndpointWithTrackContext<
              EndpointMetadata,
              TrackMetadata
            >;
          } catch (error) {
            return {
              id: endpoint.id,
              type: endpoint.type,
              metadata: undefined,
              rawMetadata: endpoint.metadata,
              metadataParsingError: error,
              tracks,
            } satisfies EndpointWithTrackContext<
              EndpointMetadata,
              TrackMetadata
            >;
          }
        });

        this.emit('connected', deserializedMediaEvent.data.id, otherEndpoints);

        otherEndpoints.forEach((endpoint) =>
          this.idToEndpoint.set(endpoint.id, endpoint),
        );

        otherEndpoints.forEach((endpoint) => {
          endpoint.tracks.forEach((ctx, trackId) => {
            this.trackIdToTrack.set(trackId, ctx);

            this.emit('trackAdded', ctx);
          });
        });
        break;
      }
      default:
        if (this.localEndpoint.id != null)
          this.handleMediaEvent(deserializedMediaEvent);
    }
  };

  /**
   * Retrieves statistics related to the RTCPeerConnection.
   * These statistics provide insights into the performance and status of the connection.
   *
   * @return {Promise<RTCStatsReport>}
   *
   * @external RTCPeerConnection#getStats()
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/getStats | MDN Web Docs: RTCPeerConnection.getStats()}
   */
  public async getStatistics(
    selector?: MediaStreamTrack | null,
  ): Promise<RTCStatsReport> {
    return (await this.connection?.getStats(selector)) ?? new Map();
  }

  /**
   * Returns a snapshot of currently received remote tracks.
   *
   * @example
   * if (webRTCEndpoint.getRemoteTracks()[trackId]?.simulcastConfig?.enabled) {
   *   webRTCEndpoint.setTargetTrackEncoding(trackId, encoding);
   * }
   */
  public getRemoteTracks(): Record<
    string,
    TrackContext<EndpointMetadata, TrackMetadata>
  > {
    return Object.fromEntries(this.trackIdToTrack.entries());
  }

  /**
   * Returns a snapshot of currently received remote endpoints.
   */
  public getRemoteEndpoints(): Record<
    string,
    EndpointWithTrackContext<EndpointMetadata, TrackMetadata>
  > {
    return Object.fromEntries(this.idToEndpoint.entries());
  }

  public getLocalEndpoint(): EndpointWithTrackContext<
    EndpointMetadata,
    TrackMetadata
  > {
    return this.localEndpoint;
  }

  public getBandwidthEstimation(): bigint {
    return this.bandwidthEstimation;
  }

  private handleMediaEvent = (deserializedMediaEvent: MediaEvent) => {
    let endpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata>;
    let data;
    switch (deserializedMediaEvent.type) {
      case 'offerData': {
        this.onOfferData(deserializedMediaEvent);
        break;
      }
      case 'tracksAdded': {
        this.ongoingRenegotiation = true;

        data = deserializedMediaEvent.data;
        if (this.getEndpointId() === data.endpointId) return;
        data.tracks = new Map<string, any>(Object.entries(data.tracks));
        endpoint = this.idToEndpoint.get(data.endpointId)!;
        const oldTracks = endpoint.tracks;

        data.tracks = this.mapMediaEventTracksToTrackContextImpl(
          data.tracks,
          endpoint,
        );

        endpoint.tracks = new Map([...endpoint.tracks, ...data.tracks]);

        this.idToEndpoint.set(endpoint.id, endpoint);
        Array.from(endpoint.tracks.entries()).forEach(([trackId, ctx]) => {
          if (!oldTracks.has(trackId)) {
            this.trackIdToTrack.set(trackId, ctx);

            this.emit('trackAdded', ctx);
          }
        });
        break;
      }
      case 'tracksRemoved': {
        this.ongoingRenegotiation = true;

        data = deserializedMediaEvent.data;
        const endpointId = data.endpointId;
        if (this.getEndpointId() === endpointId) return;
        const trackIds = data.trackIds as string[];
        trackIds.forEach((trackId) => {
          const trackContext = this.trackIdToTrack.get(trackId)!;

          this.eraseTrack(trackId, endpointId);

          this.emit('trackRemoved', trackContext);
        });
        break;
      }

      case 'sdpAnswer':
        this.midToTrackId = new Map(
          Object.entries(deserializedMediaEvent.data.midToTrackId),
        );

        for (const trackId of Object.values(
          deserializedMediaEvent.data.midToTrackId,
        )) {
          const track = this.localTrackIdToTrack.get(trackId as string);
          // if is local track
          if (track) {
            track.negotiationStatus = 'done';

            if (track.pendingMetadataUpdate) {
              const mediaEvent = generateMediaEvent('updateTrackMetadata', {
                trackId,
                trackMetadata: track.metadata,
              });
              this.sendMediaEvent(mediaEvent);
            }

            track.pendingMetadataUpdate = false;
          }
        }

        this.onAnswer(deserializedMediaEvent.data);

        this.ongoingRenegotiation = false;
        this.processNextCommand();
        break;

      case 'candidate':
        this.onRemoteCandidate(deserializedMediaEvent.data);
        break;

      case 'endpointAdded':
        endpoint = deserializedMediaEvent.data;
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

        this.emit('endpointAdded', endpoint);
        break;

      case 'endpointRemoved':
        if (deserializedMediaEvent.data.id === this.localEndpoint.id) {
          this.cleanUp();
          this.emit('disconnected');
          return;
        }

        endpoint = this.idToEndpoint.get(deserializedMediaEvent.data.id)!;
        if (endpoint === undefined) return;

        Array.from(endpoint.tracks.keys()).forEach((trackId) => {
          this.emit('trackRemoved', this.trackIdToTrack.get(trackId)!);
        });

        this.eraseEndpoint(endpoint);

        this.emit('endpointRemoved', endpoint);
        break;

      case 'endpointUpdated':
        if (this.getEndpointId() === deserializedMediaEvent.data.id) return;
        endpoint = this.idToEndpoint.get(deserializedMediaEvent.data.id)!;
        try {
          endpoint.metadata = this.endpointMetadataParser(
            deserializedMediaEvent.data.metadata,
          );
          endpoint.metadataParsingError = undefined;
        } catch (error) {
          endpoint.metadata = undefined;
          endpoint.metadataParsingError = error;
        }
        endpoint.rawMetadata = deserializedMediaEvent.data.metadata;
        this.addEndpoint(endpoint);

        this.emit('endpointUpdated', endpoint);
        break;

      case 'trackUpdated': {
        if (this.getEndpointId() === deserializedMediaEvent.data.endpointId)
          return;

        endpoint = this.idToEndpoint.get(
          deserializedMediaEvent.data.endpointId,
        )!;
        if (endpoint == null)
          throw `Endpoint with id: ${deserializedMediaEvent.data.endpointId} doesn't exist`;

        const trackId = deserializedMediaEvent.data.trackId;
        const trackMetadata = deserializedMediaEvent.data.metadata;
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

        this.emit('trackUpdated', trackContext);
        break;
      }

      case 'trackEncodingDisabled': {
        if (this.getEndpointId() === deserializedMediaEvent.data.endpointId)
          return;

        endpoint = this.idToEndpoint.get(
          deserializedMediaEvent.data.endpointId,
        )!;
        if (endpoint == null)
          throw `Endpoint with id: ${deserializedMediaEvent.data.endpointId} doesn't exist`;

        const trackId = deserializedMediaEvent.data.trackId;
        const encoding = deserializedMediaEvent.data.encoding;

        const trackContext = endpoint.tracks.get(trackId)!;

        this.emit('trackEncodingDisabled', trackContext, encoding);
        break;
      }

      case 'trackEncodingEnabled': {
        if (this.getEndpointId() === deserializedMediaEvent.data.endpointId)
          return;

        endpoint = this.idToEndpoint.get(
          deserializedMediaEvent.data.endpointId,
        )!;
        if (endpoint == null)
          throw `Endpoint with id: ${deserializedMediaEvent.data.endpointId} doesn't exist`;

        const trackId = deserializedMediaEvent.data.trackId;
        const encoding = deserializedMediaEvent.data.encoding;

        const trackContext = endpoint.tracks.get(trackId)!;

        this.emit('trackEncodingEnabled', trackContext, encoding);
        break;
      }

      case 'tracksPriority': {
        const enabledTracks = (
          deserializedMediaEvent.data.tracks as string[]
        ).map((trackId) => this.trackIdToTrack.get(trackId)!);

        const disabledTracks = Array.from(this.trackIdToTrack.values()).filter(
          (track) => !enabledTracks.includes(track),
        );

        this.emit('tracksPriorityChanged', enabledTracks, disabledTracks);
        break;
      }
      case 'encodingSwitched': {
        const trackId = deserializedMediaEvent.data.trackId;
        const trackContext = this.trackIdToTrack.get(trackId)!;
        trackContext.encoding = deserializedMediaEvent.data.encoding;
        trackContext.encodingReason = deserializedMediaEvent.data.reason;

        trackContext.emit('encodingChanged', trackContext);
        break;
      }
      case 'custom':
        this.handleMediaEvent(deserializedMediaEvent.data as MediaEvent);
        break;

      case 'error':
        this.emit('signalingError', {
          message: deserializedMediaEvent.data.message,
        });

        this.disconnect();
        break;

      case 'vadNotification': {
        handleVoiceActivationDetectionNotification(
          deserializedMediaEvent,
          this.trackIdToTrack,
        );
        break;
      }

      case 'bandwidthEstimation': {
        this.bandwidthEstimation = deserializedMediaEvent.data.estimation;

        this.emit('bandwidthEstimationChanged', this.bandwidthEstimation);
        break;
      }

      default:
        console.warn(
          'Received unknown media event: ',
          deserializedMediaEvent.type,
        );
        break;
    }
  };

  /**
   * Adds track that will be sent to the RTC Engine.
   * @param track - Audio or video track e.g. from your microphone or camera.
   * @param stream  - Stream that this track belongs to.
   * @param trackMetadata - Any information about this track that other endpoints will
   * receive in {@link WebRTCEndpointEvents.endpointAdded}. E.g. this can source of the track - whether it's
   * screensharing, webcam or some other media device.
   * @param simulcastConfig - Simulcast configuration. By default simulcast is disabled.
   * For more information refer to {@link SimulcastConfig}.
   * @param maxBandwidth - maximal bandwidth this track can use.
   * Defaults to 0 which is unlimited.
   * This option has no effect for simulcast and audio tracks.
   * For simulcast tracks use `{@link WebRTCEndpoint.setTrackBandwidth}.
   * @returns {string} Returns id of added track
   * @example
   * ```ts
   * let localStream: MediaStream = new MediaStream();
   * try {
   *   localAudioStream = await navigator.mediaDevices.getUserMedia(
   *     AUDIO_CONSTRAINTS
   *   );
   *   localAudioStream
   *     .getTracks()
   *     .forEach((track) => localStream.addTrack(track));
   * } catch (error) {
   *   console.error("Couldn't get microphone permission:", error);
   * }
   *
   * try {
   *   localVideoStream = await navigator.mediaDevices.getUserMedia(
   *     VIDEO_CONSTRAINTS
   *   );
   *   localVideoStream
   *     .getTracks()
   *     .forEach((track) => localStream.addTrack(track));
   * } catch (error) {
   *  console.error("Couldn't get camera permission:", error);
   * }
   *
   * localStream
   *  .getTracks()
   *  .forEach((track) => webrtc.addTrack(track, localStream));
   * ```
   */
  public addTrack(
    track: MediaStreamTrack,
    trackMetadata?: TrackMetadata,
    simulcastConfig: SimulcastConfig = {
      enabled: false,
      activeEncodings: [],
      disabledEncodings: [],
    },
    maxBandwidth: TrackBandwidthLimit = 0,
  ): Promise<string> {
    const resolutionNotifier = new Deferred<void>();
    const trackId = this.getTrackId(uuidv4());
    const stream = new MediaStream();

    let metadata: any;
    try {
      const parsedMetadata = this.trackMetadataParser(trackMetadata);
      metadata = parsedMetadata;

      stream.addTrack(track);

      this.pushCommand({
        commandType: 'ADD-TRACK',
        trackId,
        track,
        stream,
        trackMetadata: parsedMetadata,
        simulcastConfig,
        maxBandwidth,
        resolutionNotifier,
      });
    } catch (error) {
      resolutionNotifier.reject(error);
    }

    return resolutionNotifier.promise.then(() => {
      this.emit('localTrackAdded', {
        trackId,
        track,
        stream,
        trackMetadata: metadata,
        simulcastConfig,
        maxBandwidth,
      });
      return trackId;
    });
  }

  private pushCommand(command: Command<TrackMetadata>) {
    this.commandsQueue.push(command);
    this.processNextCommand();
  }

  private handleCommand(command: Command<TrackMetadata>) {
    switch (command.commandType) {
      case 'ADD-TRACK':
        this.addTrackHandler(command);
        break;
      case 'REMOVE-TRACK':
        this.removeTrackHandler(command);
        break;
      case 'REPLACE-TRACK':
        this.replaceTrackHandler(command);
        break;
    }
  }

  private processNextCommand() {
    if (this.ongoingRenegotiation || this.ongoingTrackReplacement) return;

    if (
      this.connection &&
      (this.connection.signalingState !== 'stable' ||
        this.connection.connectionState !== 'connected' ||
        this.connection.iceConnectionState !== 'connected')
    )
      return;

    this.resolvePreviousCommand();

    const command = this.commandsQueue.shift();

    if (!command) return;

    this.commandResolutionNotifier = command.resolutionNotifier;
    this.handleCommand(command);
  }

  private resolvePreviousCommand() {
    if (this.commandResolutionNotifier) {
      this.commandResolutionNotifier.resolve();
      this.commandResolutionNotifier = null;
    }
  }

  private addTrackHandler(addTrackCommand: AddTrackCommand<TrackMetadata>) {
    const {
      simulcastConfig,
      maxBandwidth,
      track,
      stream,
      trackMetadata,
      trackId,
    } = addTrackCommand;
    const isUsedTrack = this.connection
      ?.getSenders()
      .some((val) => val.track === track);

    let error;
    if (isUsedTrack) {
      error =
        "This track was already added to peerConnection, it can't be added again!";
    }

    if (!simulcastConfig.enabled && !(typeof maxBandwidth === 'number'))
      error =
        'Invalid type of `maxBandwidth` argument for a non-simulcast track, expected: number';
    if (this.getEndpointId() === '')
      error = 'Cannot add tracks before being accepted by the server';

    if (error) {
      this.commandResolutionNotifier?.reject(error);
      this.commandResolutionNotifier = null;
      this.processNextCommand();
      return;
    }

    this.ongoingRenegotiation = true;

    const trackContext = new TrackContextImpl(
      this.localEndpoint,
      trackId,
      trackMetadata,
      simulcastConfig,
      this.trackMetadataParser,
    );

    trackContext.track = track;
    trackContext.stream = stream;
    trackContext.maxBandwidth = maxBandwidth;

    this.localEndpoint.tracks.set(trackId, trackContext);

    this.localTrackIdToTrack.set(trackId, trackContext);

    if (this.connection) {
      this.addTrackToConnection(trackContext);

      this.connection
        .getTransceivers()
        .forEach(
          (transceiver) =>
            (transceiver.direction =
              transceiver.direction === 'sendrecv'
                ? 'sendonly'
                : transceiver.direction),
        );
    }

    this.trackIdToSender.set(trackId, {
      remoteTrackId: trackId,
      localTrackId: track.id,
      sender: null,
    });
    const mediaEvent = generateCustomEvent({ type: 'renegotiateTracks' });
    this.sendMediaEvent(mediaEvent);
  }

  private addTrackToConnection = (
    trackContext: TrackContext<EndpointMetadata, TrackMetadata>,
  ) => {
    const transceiverConfig = this.createTransceiverConfig(trackContext);
    const track = trackContext.track!;
    this.connection!.addTransceiver(track, transceiverConfig);
  };

  private createTransceiverConfig(
    trackContext: TrackContext<EndpointMetadata, TrackMetadata>,
  ): RTCRtpTransceiverInit {
    let transceiverConfig: RTCRtpTransceiverInit;

    if (trackContext.track!.kind === 'audio') {
      transceiverConfig = this.createAudioTransceiverConfig(trackContext);
    } else {
      transceiverConfig = this.createVideoTransceiverConfig(trackContext);
    }

    return transceiverConfig;
  }

  private createAudioTransceiverConfig(
    trackContext: TrackContext<EndpointMetadata, TrackMetadata>,
  ): RTCRtpTransceiverInit {
    return {
      direction: 'sendonly',
      streams: trackContext.stream ? [trackContext.stream] : [],
    };
  }

  private createVideoTransceiverConfig(
    trackContext: TrackContext<EndpointMetadata, TrackMetadata>,
  ): RTCRtpTransceiverInit {
    let transceiverConfig: RTCRtpTransceiverInit;
    if (trackContext.simulcastConfig!.enabled) {
      transceiverConfig = simulcastTransceiverConfig;
      const trackActiveEncodings =
        trackContext.simulcastConfig!.activeEncodings;
      const disabledTrackEncodings: TrackEncoding[] = [];
      transceiverConfig.sendEncodings?.forEach((encoding) => {
        if (trackActiveEncodings.includes(encoding.rid! as TrackEncoding)) {
          encoding.active = true;
        } else {
          disabledTrackEncodings.push(encoding.rid! as TrackEncoding);
        }
      });
      this.disabledTrackEncodings.set(
        trackContext.trackId,
        disabledTrackEncodings,
      );
    } else {
      transceiverConfig = {
        direction: 'sendonly',
        sendEncodings: [
          {
            active: true,
          },
        ],
        streams: trackContext.stream ? [trackContext.stream] : [],
      };
    }

    if (trackContext.maxBandwidth && transceiverConfig.sendEncodings)
      applyBandwidthLimitation(
        transceiverConfig.sendEncodings,
        trackContext.maxBandwidth,
      );

    return transceiverConfig;
  }

  /**
   * Replaces a track that is being sent to the RTC Engine.
   * @param trackId - Audio or video track.
   * @param {string} trackId - Id of audio or video track to replace.
   * @param {MediaStreamTrack} newTrack
   * @param {any} [newTrackMetadata] - Optional track metadata to apply to the new track. If no
   *                              track metadata is passed, the old track metadata is retained.
   * @returns {Promise<boolean>} success
   * @example
   * ```ts
   * // setup camera
   * let localStream: MediaStream = new MediaStream();
   * try {
   *   localVideoStream = await navigator.mediaDevices.getUserMedia(
   *     VIDEO_CONSTRAINTS
   *   );
   *   localVideoStream
   *     .getTracks()
   *     .forEach((track) => localStream.addTrack(track));
   * } catch (error) {
   *   console.error("Couldn't get camera permission:", error);
   * }
   * let oldTrackId;
   * localStream
   *  .getTracks()
   *  .forEach((track) => trackId = webrtc.addTrack(track, localStream));
   *
   * // change camera
   * const oldTrack = localStream.getVideoTracks()[0];
   * let videoDeviceId = "abcd-1234";
   * navigator.mediaDevices.getUserMedia({
   *      video: {
   *        ...(VIDEO_CONSTRAINTS as {}),
   *        deviceId: {
   *          exact: videoDeviceId,
   *        },
   *      }
   *   })
   *   .then((stream) => {
   *     let videoTrack = stream.getVideoTracks()[0];
   *     webrtc.replaceTrack(oldTrackId, videoTrack);
   *   })
   *   .catch((error) => {
   *     console.error('Error switching camera', error);
   *   })
   * ```
   */
  public async replaceTrack(
    trackId: string,
    newTrack: MediaStreamTrack | null,
    newTrackMetadata?: any,
  ): Promise<void> {
    const resolutionNotifier = new Deferred<void>();
    try {
      const newMetadata =
        newTrackMetadata !== undefined
          ? this.trackMetadataParser(newTrackMetadata)
          : undefined;

      this.pushCommand({
        commandType: 'REPLACE-TRACK',
        trackId,
        newTrack,
        newTrackMetadata: newMetadata,
        resolutionNotifier,
      });
    } catch (error) {
      resolutionNotifier.reject(error);
    }
    return resolutionNotifier.promise.then(() => {
      this.emit('localTrackReplaced', {
        trackId,
        track: newTrack,
        metadata: newTrackMetadata,
      });
    });
  }

  private async replaceTrackHandler(
    command: ReplaceTackCommand<TrackMetadata>,
  ) {
    const { trackId, newTrack, newTrackMetadata } = command;

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
      this.sendMediaEvent(mediaEvent);
      this.emit('localTrackMuted', { trackId: trackId });
    } else if (!trackContext.track && newTrack) {
      const mediaEvent = generateMediaEvent('unmuteTrack', {
        trackId: trackId,
      });
      this.sendMediaEvent(mediaEvent);
      this.emit('localTrackUnmuted', { trackId: trackId });
    }

    trackContext.track = newTrack;

    track.localTrackId = newTrack?.id ?? null;

    try {
      await sender.replaceTrack(newTrack);
      trackContext.track = newTrack;

      if (newTrackMetadata) {
        this.updateTrackMetadata(trackId, newTrackMetadata);
      }
    } catch (error) {
      // ignore
    } finally {
      this.resolvePreviousCommand();
      this.ongoingTrackReplacement = false;
      this.processNextCommand();
    }
  }

  /**
   * Updates maximum bandwidth for the track identified by trackId.
   * This value directly translates to quality of the stream and, in case of video, to the amount of RTP packets being sent.
   * In case trackId points at the simulcast track bandwidth is split between all of the variant streams proportionally to their resolution.
   *
   * @param {string} trackId
   * @param {BandwidthLimit} bandwidth in kbps
   * @returns {Promise<boolean>} success
   */
  public setTrackBandwidth(
    trackId: string,
    bandwidth: BandwidthLimit,
  ): Promise<boolean> {
    // FIXME: maxBandwidth in TrackContext is not updated
    const trackContext = this.localTrackIdToTrack.get(trackId);

    if (!trackContext) {
      return Promise.reject(`Track '${trackId}' doesn't exist`);
    }

    const sender = this.findSender(trackContext.track!.id);
    const parameters = sender.getParameters();

    if (parameters.encodings.length === 0) {
      parameters.encodings = [{}];
    } else {
      applyBandwidthLimitation(parameters.encodings, bandwidth);
    }

    return sender
      .setParameters(parameters)
      .then(() => {
        const mediaEvent = createTrackVariantBitratesEvent(
          trackId,
          this.connection,
          this.localTrackIdToTrack,
        );
        this.sendMediaEvent(mediaEvent);

        this.emit('localTrackBandwidthSet', {
          trackId,
          bandwidth,
        });
        return true;
      })
      .catch((_error) => false);
  }

  /**
   * Updates maximum bandwidth for the given simulcast encoding of the given track.
   *
   * @param {string} trackId - id of the track
   * @param {string} rid - rid of the encoding
   * @param {BandwidthLimit} bandwidth - desired max bandwidth used by the encoding (in kbps)
   * @returns
   */
  public setEncodingBandwidth(
    trackId: string,
    rid: string,
    bandwidth: BandwidthLimit,
  ): Promise<boolean> {
    const trackContext = this.localTrackIdToTrack.get(trackId)!;

    if (!trackContext) {
      return Promise.reject(`Track '${trackId}' doesn't exist`);
    }

    const sender = this.findSender(trackContext.track!.id);
    const parameters = sender.getParameters();
    const encoding = parameters.encodings.find(
      (encoding) => encoding.rid === rid,
    );

    if (!encoding) {
      return Promise.reject(`Encoding with rid '${rid}' doesn't exist`);
    } else if (bandwidth === 0) {
      delete encoding.maxBitrate;
    } else {
      encoding.maxBitrate = bandwidth * 1024;
    }

    return sender
      .setParameters(parameters)
      .then(() => {
        const mediaEvent = generateCustomEvent({
          type: 'trackVariantBitrates',
          data: {
            trackId: trackId,
            variantBitrates: getTrackBitrates(
              this.connection,
              this.localTrackIdToTrack,
              trackId,
            ),
          },
        });
        this.sendMediaEvent(mediaEvent);
        this.emit('localTrackEncodingBandwidthSet', {
          trackId,
          rid,
          bandwidth,
        });
        return true;
      })
      .catch((_error) => false);
  }

  /**
   * Removes a track from connection that was sent to the RTC Engine.
   * @param {string} trackId - Id of audio or video track to remove.
   * @example
   * ```ts
   * // setup camera
   * let localStream: MediaStream = new MediaStream();
   * try {
   *   localVideoStream = await navigator.mediaDevices.getUserMedia(
   *     VIDEO_CONSTRAINTS
   *   );
   *   localVideoStream
   *     .getTracks()
   *     .forEach((track) => localStream.addTrack(track));
   * } catch (error) {
   *   console.error("Couldn't get camera permission:", error);
   * }
   *
   * let trackId
   * localStream
   *  .getTracks()
   *  .forEach((track) => trackId = webrtc.addTrack(track, localStream));
   *
   * // remove track
   * webrtc.removeTrack(trackId)
   * ```
   */
  public removeTrack(trackId: string): Promise<void> {
    const resolutionNotifier = new Deferred<void>();
    this.pushCommand({
      commandType: 'REMOVE-TRACK',
      trackId,
      resolutionNotifier,
    });
    return resolutionNotifier.promise.then(() => {
      this.emit('localTrackRemoved', {
        trackId,
      });
    });
  }

  private removeTrackHandler(command: RemoveTrackCommand) {
    const { trackId } = command;
    const trackContext = this.localTrackIdToTrack.get(trackId)!;
    const sender = this.findSender(trackContext.track!.id);

    this.ongoingRenegotiation = true;

    this.connection!.removeTrack(sender);
    const mediaEvent = generateCustomEvent({ type: 'renegotiateTracks' });
    this.sendMediaEvent(mediaEvent);
    this.localTrackIdToTrack.delete(trackId);
    this.localEndpoint.tracks.delete(trackId);
  }

  /**
   * Sets track variant that server should send to the client library.
   *
   * The variant will be sent whenever it is available.
   * If chosen variant is temporarily unavailable, some other variant
   * will be sent until the chosen variant becomes active again.
   *
   * @param {string} trackId - id of track
   * @param {TrackEncoding} variant - variant to receive
   * @example
   * ```ts
   * webrtc.setTargetTrackEncoding(incomingTrackCtx.trackId, "l")
   * ```
   */
  public setTargetTrackEncoding(trackId: string, variant: TrackEncoding) {
    const trackContext = this.trackIdToTrack.get(trackId);
    if (
      !trackContext?.simulcastConfig?.enabled ||
      !trackContext.simulcastConfig.activeEncodings.includes(variant)
    ) {
      console.warn('The track does not support changing its target variant');
      return;
    }
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
  }

  /**
   * Enables track encoding so that it will be sent to the server.
   * @param {string} trackId - id of track
   * @param {TrackEncoding} encoding - encoding that will be enabled
   * @example
   * ```ts
   * const trackId = webrtc.addTrack(track, stream, {}, {enabled: true, activeEncodings: ["l", "m", "h"]});
   * webrtc.disableTrackEncoding(trackId, "l");
   * // wait some time
   * webrtc.enableTrackEncoding(trackId, "l");
   * ```
   */
  public enableTrackEncoding(trackId: string, encoding: TrackEncoding) {
    const track = this.localTrackIdToTrack.get(trackId)?.track;
    // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
    const newDisabledTrackEncodings = this.disabledTrackEncodings
      .get(trackId)
      ?.filter((en) => en !== encoding)!;
    this.disabledTrackEncodings.set(trackId, newDisabledTrackEncodings);
    const sender = this.connection
      ?.getSenders()
      .filter((sender) => sender.track === track)[0];
    const params = sender?.getParameters();
    params!.encodings.filter((en) => en.rid == encoding)[0].active = true;
    sender?.setParameters(params!);

    const mediaEvent = generateMediaEvent('enableTrackEncoding', {
      trackId: trackId,
      encoding: encoding,
    });
    this.sendMediaEvent(mediaEvent);
    this.emit('localTrackEncodingEnabled', {
      trackId,
      encoding,
    });
  }

  /**
   * Disables track encoding so that it will be no longer sent to the server.
   * @param {string} trackId - id of track
   * @param {rackEncoding} encoding - encoding that will be disabled
   * @example
   * ```ts
   * const trackId = webrtc.addTrack(track, stream, {}, {enabled: true, activeEncodings: ["l", "m", "h"]});
   * webrtc.disableTrackEncoding(trackId, "l");
   * ```
   */
  public disableTrackEncoding(trackId: string, encoding: TrackEncoding) {
    const track = this.localTrackIdToTrack.get(trackId)?.track;
    this.disabledTrackEncodings.get(trackId)!.push(encoding);
    const sender = this.connection
      ?.getSenders()
      .filter((sender) => sender.track === track)[0];
    const params = sender?.getParameters();
    params!.encodings.filter((en) => en.rid == encoding)[0].active = false;
    sender?.setParameters(params!);

    const mediaEvent = generateMediaEvent('disableTrackEncoding', {
      trackId: trackId,
      encoding: encoding,
    });
    this.sendMediaEvent(mediaEvent);
    this.emit('localTrackEncodingDisabled', {
      trackId,
      encoding,
    });
  }

  private findSender(trackId: string): RTCRtpSender {
    return this.connection!.getSenders().find(
      (sender) => sender.track && sender!.track!.id === trackId,
    )!;
  }

  /**
   * Updates the metadata for the current endpoint.
   * @param metadata - Data about this endpoint that other endpoints will receive upon being added.
   *
   * If the metadata is different from what is already tracked in the room, the optional
   * event `endpointUpdated` will be emitted for other endpoint in the room.
   */
  public updateEndpointMetadata = (metadata: any): void => {
    this.localEndpoint.metadata = this.endpointMetadataParser(metadata);
    this.localEndpoint.rawMetadata = this.localEndpoint.metadata;
    this.localEndpoint.metadataParsingError = undefined;
    const mediaEvent = generateMediaEvent('updateEndpointMetadata', {
      metadata: this.localEndpoint.metadata,
    });
    this.sendMediaEvent(mediaEvent);
    this.emit('localEndpointMetadataChanged', {
      metadata,
    });
  };

  /**
   * Updates the metadata for a specific track.
   * @param trackId - trackId (generated in addTrack) of audio or video track.
   * @param trackMetadata - Data about this track that other endpoint will receive upon being added.
   *
   * If the metadata is different from what is already tracked in the room, the optional
   * event `trackUpdated` will be emitted for other endpoints in the room.
   */
  public updateTrackMetadata = (trackId: string, trackMetadata: any): void => {
    const trackContext = this.localTrackIdToTrack.get(trackId)!;
    const prevTrack = this.localEndpoint.tracks.get(trackId)!;
    try {
      trackContext.metadata = this.trackMetadataParser(trackMetadata);
      trackContext.rawMetadata = trackMetadata;
      trackContext.metadataParsingError = undefined;

      this.localEndpoint.tracks.set(trackId, trackContext);
    } catch (error) {
      trackContext.metadata = undefined;
      trackContext.metadataParsingError = error;
      this.localEndpoint.tracks.set(trackId, {
        ...prevTrack,
        metadata: undefined,
        metadataParsingError: error,
      });
      throw error;
    }

    this.localTrackIdToTrack.set(trackId, trackContext);

    const mediaEvent = generateMediaEvent('updateTrackMetadata', {
      trackId,
      trackMetadata: trackContext.metadata,
    });

    switch (trackContext.negotiationStatus) {
      case 'done':
        this.sendMediaEvent(mediaEvent);

        this.emit('localTrackMetadataChanged', {
          trackId,
          metadata: trackMetadata,
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

  private getMidToTrackId = (): Record<string, string> | null => {
    const localTrackMidToTrackId: Record<string, string> = {};

    if (!this.connection) return null;
    this.connection.getTransceivers().forEach((transceiver) => {
      const localTrackId = transceiver.sender.track?.id;
      const mid = transceiver.mid;
      if (localTrackId && mid) {
        const trackContext = Array.from(this.localTrackIdToTrack.values()).find(
          (trackContext) => trackContext!.track!.id === localTrackId,
        )!;
        localTrackMidToTrackId[mid] = trackContext.trackId;
      }
    });
    return localTrackMidToTrackId;
  };

  /**
   * Disconnects from the room. This function should be called when user disconnects from the room
   * in a clean way e.g. by clicking a dedicated, custom button `disconnect`.
   * As a result there will be generated one more media event that should be
   * sent to the RTC Engine. Thanks to it each other endpoint will be notified
   * that endpoint was removed in {@link WebRTCEndpointEvents.endpointRemoved},
   */
  public disconnect = () => {
    const mediaEvent = generateMediaEvent('disconnect');
    this.sendMediaEvent(mediaEvent);
    this.emit('disconnectRequested', {});
    this.cleanUp();
  };

  /**
   * Cleans up {@link WebRTCEndpoint} instance.
   */
  public cleanUp = () => {
    if (this.connection) {
      this.connection.onicecandidate = null;
      this.connection.ontrack = null;
      this.connection.onconnectionstatechange = null;
      this.connection.onicecandidateerror = null;
      this.connection.oniceconnectionstatechange = null;
      this.connection.close();

      this.commandResolutionNotifier?.reject('Disconnected');
      this.commandResolutionNotifier = null;
      this.commandsQueue = [];
      this.ongoingTrackReplacement = false;
      this.ongoingRenegotiation = false;
    }

    this.connection = undefined;
  };

  private getTrackId(uuid: string): string {
    return `${this.getEndpointId()}:${uuid}`;
  }

  private sendMediaEvent = (mediaEvent: MediaEvent) => {
    const serializedMediaEvent = serializeMediaEvent(mediaEvent);
    this.emit('sendMediaEvent', serializedMediaEvent);
  };

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

  private addTransceiversIfNeeded = (serverTracks: Map<string, number>) => {
    const recvTransceivers = this.connection!.getTransceivers().filter(
      (elem) => elem.direction === 'recvonly',
    );
    let toAdd: string[] = [];

    const getNeededTransceiversTypes = (type: string): string[] => {
      let typeNumber = serverTracks.get(type);
      typeNumber = typeNumber !== undefined ? typeNumber : 0;
      const typeTransceiversNumber = recvTransceivers.filter(
        (elem) => elem.receiver.track.kind === type,
      ).length;
      return Array(typeNumber - typeTransceiversNumber).fill(type);
    };

    const audio = getNeededTransceiversTypes('audio');
    const video = getNeededTransceiversTypes('video');
    toAdd = toAdd.concat(audio);
    toAdd = toAdd.concat(video);

    for (const kind of toAdd)
      this.connection?.addTransceiver(kind, { direction: 'recvonly' });
  };

  private async createAndSendOffer() {
    const connection = this.connection;
    if (!connection) return;

    try {
      const offer = await connection.createOffer();

      if (!this.connection) {
        console.warn('RTCPeerConnection stopped or restarted');
        return;
      }
      await connection.setLocalDescription(offer);

      if (!this.connection) {
        console.warn('RTCPeerConnection stopped or restarted');
        return;
      }

      const mediaEvent = generateCustomEvent({
        type: 'sdpOffer',
        data: {
          sdpOffer: offer,
          trackIdToTrackMetadata: this.getTrackIdToMetadata(),
          trackIdToTrackBitrates: getTrackIdToTrackBitrates(
            this.connection,
            this.localTrackIdToTrack,
            this.localEndpoint.tracks,
          ),
          midToTrackId: this.getMidToTrackId(),
        },
      });
      this.sendMediaEvent(mediaEvent);

      for (const track of this.localTrackIdToTrack.values()) {
        track.negotiationStatus = 'offered';
      }
    } catch (error) {
      console.error(error);
    }
  }

  private getTrackIdToMetadata = (): Record<
    string,
    TrackMetadata | undefined
  > => {
    const trackIdToMetadata: Record<string, TrackMetadata | undefined> = {};
    Array.from(this.localEndpoint.tracks.entries()).forEach(
      ([trackId, { metadata }]) => {
        trackIdToMetadata[trackId] = metadata;
      },
    );
    return trackIdToMetadata;
  };

  private checkIfTrackBelongToEndpoint = (
    trackId: string,
    endpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata>,
  ) =>
    Array.from(endpoint.tracks.keys()).some((track) =>
      trackId.startsWith(track),
    );

  private onOfferData = async (offerData: MediaEvent) => {
    if (!this.connection) {
      const turnServers = offerData.data.integratedTurnServers;
      this.setTurns(turnServers);

      this.connection = new RTCPeerConnection(this.rtcConfig);
      this.connection.onicecandidate = this.onLocalCandidate();
      this.connection.onicecandidateerror = this.onIceCandidateError as (
        event: Event,
      ) => void;
      this.connection.onconnectionstatechange = this.onConnectionStateChange;
      this.connection.oniceconnectionstatechange =
        this.onIceConnectionStateChange;
      this.connection.onicegatheringstatechange =
        this.onIceGatheringStateChange;
      this.connection.onsignalingstatechange = this.onSignalingStateChange;

      Array.from(this.localTrackIdToTrack.values()).forEach((trackContext) =>
        this.addTrackToConnection(trackContext),
      );

      this.connection
        .getTransceivers()
        .forEach((transceiver) => (transceiver.direction = 'sendonly'));
    } else {
      this.connection.restartIce();
    }

    this.trackIdToSender.forEach((sth) => {
      if (sth.localTrackId) {
        sth.sender = this.findSender(sth.localTrackId);
      }
    });

    const tracks = new Map<string, number>(
      Object.entries(offerData.data.tracksTypes),
    );

    this.addTransceiversIfNeeded(tracks);

    await this.createAndSendOffer();
  };

  private onRemoteCandidate = (candidate: RTCIceCandidate) => {
    try {
      const iceCandidate = new RTCIceCandidate(candidate);
      if (!this.connection) {
        throw new Error(
          'Received new remote candidate but RTCConnection is undefined',
        );
      }
      this.connection.addIceCandidate(iceCandidate);
    } catch (error) {
      console.error(error);
    }
  };

  private onLocalCandidate = () => {
    return (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate) {
        const mediaEvent = generateCustomEvent({
          type: 'candidate',
          data: {
            candidate: event.candidate.candidate,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          },
        });
        this.sendMediaEvent(mediaEvent);
      }
    };
  };

  private onIceCandidateError = (event: RTCPeerConnectionIceErrorEvent) => {
    console.warn(event);
  };

  private onConnectionStateChange = (event: Event) => {
    switch (this.connection?.connectionState) {
      case 'connected':
        this.processNextCommand();
        break;
      case 'failed':
        this.emit('connectionError', {
          message: 'RTCPeerConnection failed',
          event,
        });
        break;
    }
  };

  private onIceConnectionStateChange = (event: Event) => {
    switch (this.connection?.iceConnectionState) {
      case 'disconnected':
        console.warn('ICE connection: disconnected');
        // Requesting renegotiation on ICE connection state failed fixes RTCPeerConnection
        // when the user changes their WiFi network.
        this.sendMediaEvent(generateCustomEvent({ type: 'renegotiateTracks' }));
        break;
      case 'failed':
        this.emit('connectionError', {
          message: 'ICE connection failed',
          event,
        });
        break;
      case 'connected':
        this.processNextCommand();
        break;
    }
  };

  private onIceGatheringStateChange = (_event: any) => {
    switch (this.connection?.iceGatheringState) {
      case 'complete':
        this.processNextCommand();
        break;
    }
  };

  private onSignalingStateChange = (_event: any) => {
    switch (this.connection?.signalingState) {
      case 'stable':
        this.processNextCommand();
        break;
    }
  };

  private onTrack = () => {
    return (event: RTCTrackEvent) => {
      const [stream] = event.streams;
      const mid = event.transceiver.mid!;

      const trackId = this.midToTrackId.get(mid)!;
      if (this.checkIfTrackBelongToEndpoint(trackId, this.localEndpoint))
        return;

      const trackContext = this.trackIdToTrack.get(trackId)!;

      trackContext.stream = stream;
      trackContext.track = event.track;

      this.idToEndpoint
        .get(trackContext.endpoint.id)
        ?.tracks.set(trackId, trackContext);

      this.emit('trackReady', trackContext);
    };
  };

  private setTurns = (turnServers: any[]): void => {
    turnServers.forEach((turnServer: any) => {
      let transport, uri;
      if (turnServer.transport == 'tls') {
        transport = 'tcp';
        uri = 'turns';
      } else {
        transport = turnServer.transport;
        uri = 'turn';
      }

      const rtcIceServer: RTCIceServer = {
        credential: turnServer.password,
        urls: uri.concat(
          ':',
          turnServer.serverAddr,
          ':',
          turnServer.serverPort,
          '?transport=',
          transport,
        ),
        username: turnServer.username,
      };

      this.rtcConfig.iceServers!.push(rtcIceServer);
    });
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

  private getEndpointId = () => this.localEndpoint.id;

  private mapMediaEventTracksToTrackContextImpl = (
    tracks: Map<string, any>,
    endpoint: EndpointWithTrackContext<EndpointMetadata, TrackMetadata>,
  ): Map<string, TrackContextImpl<EndpointMetadata, TrackMetadata>> => {
    const mappedTracks: Array<
      [string, TrackContextImpl<EndpointMetadata, TrackMetadata>]
    > = Array.from(tracks).map(([trackId, track]) => [
      trackId,
      new TrackContextImpl(
        endpoint,
        trackId,
        track.metadata,
        track.simulcastConfig,
        this.trackMetadataParser,
      ),
    ]);

    return new Map(mappedTracks);
  };
}
