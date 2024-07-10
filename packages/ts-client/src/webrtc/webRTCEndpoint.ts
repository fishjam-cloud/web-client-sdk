import type { MediaEvent, SerializedMediaEvent } from './mediaEvent';
import {
  deserializeMediaEvent,
  generateCustomEvent,
  generateMediaEvent,
  serializeMediaEvent,
} from './mediaEvent';
import { v4 as uuidv4 } from 'uuid';
import EventEmitter from 'events';
import type TypedEmitter from 'typed-emitter';
import { Deferred } from './deferred';
import type {
  BandwidthLimit,
  Config,
  MetadataParser,
  SimulcastConfig,
  TrackBandwidthLimit,
  TrackContext,
  TrackEncoding,
  WebRTCEndpointEvents,
} from './types';
import type { EndpointWithTrackContext } from './internal';
import { mapMediaEventTracksToTrackContextImpl } from './internal';
import { applyBandwidthLimitation } from './bandwidth';
import { createTrackVariantBitratesEvent, getTrackBitrates } from './bitrate';
import { findSender, findSenderByTrack } from './RTCPeerConnectionUtils';
import {
  addTrackToConnection,
  addTransceiversIfNeeded,
  setTransceiversToReadOnly,
} from './transciever';
import { createSdpOfferEvent } from './sdpEvents';
import { setTurns } from './turn';
import { StateManager } from './StateManager';
import { NegotiationManager } from './NegotiationManager';
import { CommandsQueue } from './CommandsQueue';

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
  private readonly endpointMetadataParser: MetadataParser<EndpointMetadata>;
  private readonly trackMetadataParser: MetadataParser<TrackMetadata>;

  private readonly stateManager: StateManager<EndpointMetadata, TrackMetadata>;
  private readonly negotiationManager: NegotiationManager;
  private readonly commandsQueue: CommandsQueue<
    EndpointMetadata,
    TrackMetadata
  >;

  private clearConnectionCallbacks: (() => void) | null = null;

  constructor(config?: Config<EndpointMetadata, TrackMetadata>) {
    super();
    this.endpointMetadataParser =
      config?.endpointMetadataParser ?? ((x) => x as EndpointMetadata);
    this.trackMetadataParser =
      config?.trackMetadataParser ?? ((x) => x as TrackMetadata);

    this.negotiationManager = new NegotiationManager();
    this.stateManager = new StateManager(
      this,
      this.negotiationManager,
      this.endpointMetadataParser,
      this.trackMetadataParser,
    );
    this.commandsQueue = new CommandsQueue(
      this.stateManager,
      this.negotiationManager,
    );
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
      this.stateManager.localEndpoint.metadata =
        this.endpointMetadataParser(metadata);
      this.stateManager.localEndpoint.metadataParsingError = undefined;
    } catch (error) {
      this.stateManager.localEndpoint.metadata = undefined;
      this.stateManager.localEndpoint.metadataParsingError = error;
      throw error;
    }
    this.stateManager.localEndpoint.rawMetadata = metadata;
    const mediaEvent = generateMediaEvent('connect', {
      metadata: this.stateManager.localEndpoint.metadata,
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
        this.stateManager.localEndpoint.id = deserializedMediaEvent.data.id;

        const endpoints: any[] = deserializedMediaEvent.data.otherEndpoints;

        const otherEndpoints: EndpointWithTrackContext<
          EndpointMetadata,
          TrackMetadata
        >[] = endpoints.map((endpoint) => {
          const tracks = mapMediaEventTracksToTrackContextImpl<
            EndpointMetadata,
            TrackMetadata
          >(
            new Map<string, TrackContext<EndpointMetadata, TrackMetadata>>(
              Object.entries(endpoint.tracks),
            ),
            endpoint,
            this.trackMetadataParser,
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
          this.stateManager.idToEndpoint.set(endpoint.id, endpoint),
        );

        otherEndpoints.forEach((endpoint) => {
          endpoint.tracks.forEach((ctx, trackId) => {
            this.stateManager.trackIdToTrack.set(trackId, ctx);

            this.emit('trackAdded', ctx);
          });
        });
        break;
      }
      default:
        if (this.stateManager.localEndpoint.id != null)
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
    return (
      (await this.stateManager.connection?.getStats(selector)) ?? new Map()
    );
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
    return Object.fromEntries(this.stateManager.trackIdToTrack.entries());
  }

  /**
   * Returns a snapshot of currently received remote endpoints.
   */
  public getRemoteEndpoints(): Record<
    string,
    EndpointWithTrackContext<EndpointMetadata, TrackMetadata>
  > {
    return Object.fromEntries(this.stateManager.idToEndpoint.entries());
  }

  public getLocalEndpoint(): EndpointWithTrackContext<
    EndpointMetadata,
    TrackMetadata
  > {
    return this.stateManager.localEndpoint;
  }

  public getBandwidthEstimation(): bigint {
    return this.stateManager.bandwidthEstimation;
  }

  private handleMediaEvent = (deserializedMediaEvent: MediaEvent) => {
    switch (deserializedMediaEvent.type) {
      case 'offerData': {
        this.onOfferData(deserializedMediaEvent);
        break;
      }
      case 'tracksAdded': {
        this.negotiationManager.ongoingRenegotiation = true;

        this.stateManager.onTracksAdded(deserializedMediaEvent.data);
        break;
      }
      case 'tracksRemoved': {
        this.negotiationManager.ongoingRenegotiation = true;

        this.stateManager.onTracksRemoved(deserializedMediaEvent.data);
        break;
      }

      case 'sdpAnswer':
        this.stateManager.onSdpAnswer(deserializedMediaEvent.data);

        this.negotiationManager.ongoingRenegotiation = false;
        this.commandsQueue.processNextCommand();
        break;

      case 'candidate':
        this.onRemoteCandidate(deserializedMediaEvent.data);
        break;

      case 'endpointAdded':
        this.stateManager.onEndpointAdded(deserializedMediaEvent.data);
        break;

      case 'endpointRemoved':
        if (
          deserializedMediaEvent.data.id === this.stateManager.localEndpoint.id
        ) {
          this.cleanUp();
          this.emit('disconnected');
          return;
        }

        this.stateManager.onEndpointRemoved(deserializedMediaEvent.data);
        break;

      case 'endpointUpdated':
        this.stateManager.onEndpointUpdated(deserializedMediaEvent.data);
        break;

      case 'trackUpdated': {
        this.stateManager.onTrackUpdated(deserializedMediaEvent.data);
        break;
      }

      case 'trackEncodingDisabled': {
        this.stateManager.onTrackEncodingDisabled(deserializedMediaEvent.data);
        break;
      }

      case 'trackEncodingEnabled': {
        this.stateManager.onTrackEncodingEnabled(deserializedMediaEvent.data);
        break;
      }

      // todo The event may not be implemented in the Fishjam
      case 'tracksPriority': {
        const enabledTracks = (
          deserializedMediaEvent.data.tracks as string[]
        ).map((trackId) => this.stateManager.trackIdToTrack.get(trackId)!);

        const disabledTracks = Array.from(
          this.stateManager.trackIdToTrack.values(),
        ).filter((track) => !enabledTracks.includes(track));

        this.emit('tracksPriorityChanged', enabledTracks, disabledTracks);
        break;
      }

      case 'encodingSwitched': {
        this.stateManager.onEncodingSwitched(deserializedMediaEvent.data);
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
        this.stateManager.onVadNotification(deserializedMediaEvent.data);
        break;
      }

      case 'bandwidthEstimation': {
        this.stateManager.onBandwidthEstimation(deserializedMediaEvent.data);
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

      this.commandsQueue.pushCommand({
        handler: () => {
          this.stateManager.addTrackHandler(
            trackId,
            track,
            stream,
            parsedMetadata,
            simulcastConfig,
            maxBandwidth,
          );
        },
        validate: () =>
          this.stateManager.validateAddTrack(
            track,
            simulcastConfig,
            maxBandwidth,
          ),
        resolve: 'after-renegotiation',
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

      this.commandsQueue.pushCommand({
        handler: () => {
          this.stateManager.replaceTrackHandler(trackId, newTrack, newMetadata);
        },
        resolutionNotifier,
        resolve: 'immediately',
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
    const trackContext = this.stateManager.localTrackIdToTrack.get(trackId);

    if (!trackContext) {
      return Promise.reject(`Track '${trackId}' doesn't exist`);
    }

    const sender = findSender(
      this.stateManager.connection,
      trackContext.track!.id,
    );
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
          this.stateManager.connection,
          this.stateManager.localTrackIdToTrack,
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
    const trackContext = this.stateManager.localTrackIdToTrack.get(trackId)!;

    if (!trackContext) {
      return Promise.reject(`Track '${trackId}' doesn't exist`);
    }

    const sender = findSender(
      this.stateManager.connection,
      trackContext.track!.id,
    );
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
              this.stateManager.connection,
              this.stateManager.localTrackIdToTrack,
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

    this.commandsQueue.pushCommand({
      handler: () => {
        this.stateManager.removeTrackHandler(trackId);
      },
      resolutionNotifier,
      resolve: 'after-renegotiation',
    });

    return resolutionNotifier.promise.then(() => {
      this.emit('localTrackRemoved', {
        trackId,
      });
    });
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
    const trackContext = this.stateManager.trackIdToTrack.get(trackId);
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
    const track = this.stateManager.localTrackIdToTrack.get(trackId)?.track;
    // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
    const newDisabledTrackEncodings = this.stateManager.disabledTrackEncodings
      .get(trackId)
      ?.filter((en) => en !== encoding)!;
    this.stateManager.disabledTrackEncodings.set(
      trackId,
      newDisabledTrackEncodings,
    );
    const sender = findSenderByTrack(this.stateManager.connection, track);
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
   * @param {TrackEncoding} encoding - encoding that will be disabled
   * @example
   * ```ts
   * const trackId = webrtc.addTrack(track, stream, {}, {enabled: true, activeEncodings: ["l", "m", "h"]});
   * webrtc.disableTrackEncoding(trackId, "l");
   * ```
   */
  public disableTrackEncoding(trackId: string, encoding: TrackEncoding) {
    this.stateManager.disableTrackEncoding(trackId, encoding);
  }

  /**
   * Updates the metadata for the current endpoint.
   * @param metadata - Data about this endpoint that other endpoints will receive upon being added.
   *
   * If the metadata is different from what is already tracked in the room, the optional
   * event `endpointUpdated` will be emitted for other endpoint in the room.
   */
  public updateEndpointMetadata = (metadata: any): void => {
    this.stateManager.localEndpoint.metadata =
      this.endpointMetadataParser(metadata);
    this.stateManager.localEndpoint.rawMetadata =
      this.stateManager.localEndpoint.metadata;
    this.stateManager.localEndpoint.metadataParsingError = undefined;
    const mediaEvent = generateMediaEvent('updateEndpointMetadata', {
      metadata: this.stateManager.localEndpoint.metadata,
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
    const trackContext = this.stateManager.localTrackIdToTrack.get(trackId)!;
    const prevTrack = this.stateManager.localEndpoint.tracks.get(trackId)!;
    try {
      trackContext.metadata = this.trackMetadataParser(trackMetadata);
      trackContext.rawMetadata = trackMetadata;
      trackContext.metadataParsingError = undefined;

      this.stateManager.localEndpoint.tracks.set(trackId, trackContext);
    } catch (error) {
      trackContext.metadata = undefined;
      trackContext.metadataParsingError = error;
      this.stateManager.localEndpoint.tracks.set(trackId, {
        ...prevTrack,
        metadata: undefined,
        metadataParsingError: error,
      });
      throw error;
    }

    this.stateManager.localTrackIdToTrack.set(trackId, trackContext);

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
    if (this.stateManager.connection) {
      this.clearConnectionCallbacks?.();
      this.stateManager.connection.close();

      this.commandsQueue.cleanUp();

      this.stateManager.ongoingTrackReplacement = false;
      this.negotiationManager.ongoingRenegotiation = false;
    }

    this.stateManager.connection = undefined;
  };

  private getTrackId(uuid: string): string {
    return `${this.stateManager.getEndpointId()}:${uuid}`;
  }

  // todo change to private
  public sendMediaEvent = (mediaEvent: MediaEvent) => {
    const serializedMediaEvent = serializeMediaEvent(mediaEvent);
    this.emit('sendMediaEvent', serializedMediaEvent);
  };

  private async createAndSendOffer() {
    const connection = this.stateManager.connection;
    if (!connection) return;

    try {
      const offer = await connection.createOffer();

      if (!this.stateManager.connection) {
        console.warn('RTCPeerConnection stopped or restarted');
        return;
      }
      await connection.setLocalDescription(offer);

      if (!this.stateManager.connection) {
        console.warn('RTCPeerConnection stopped or restarted');
        return;
      }

      const mediaEvent = createSdpOfferEvent(
        offer,
        this.stateManager.connection,
        this.stateManager.localTrackIdToTrack,
        this.stateManager.localEndpoint,
        this.stateManager.midToTrackId,
      );
      this.sendMediaEvent(mediaEvent);

      for (const track of this.stateManager.localTrackIdToTrack.values()) {
        track.negotiationStatus = 'offered';
      }
    } catch (error) {
      console.error(error);
    }
  }

  private onOfferData = async (offerData: MediaEvent) => {
    if (!this.stateManager.connection) {
      const turnServers = offerData.data.integratedTurnServers;
      setTurns(turnServers, this.stateManager.rtcConfig);

      this.stateManager.connection = new RTCPeerConnection(
        this.stateManager.rtcConfig,
      );

      const onIceCandidate = (event: RTCPeerConnectionIceEvent) =>
        this.onLocalCandidate(event);
      const onIceCandidateError = (event: RTCPeerConnectionIceErrorEvent) =>
        this.onIceCandidateError(event);
      const onConnectionStateChange = (event: Event) =>
        this.onConnectionStateChange(event);
      const onIceConnectionStateChange = (event: Event) =>
        this.onIceConnectionStateChange(event);

      this.clearConnectionCallbacks = () => {
        this.stateManager.connection?.removeEventListener(
          'icecandidate',
          onIceCandidate,
        );
        this.stateManager.connection?.removeEventListener(
          'icecandidateerror',
          onIceCandidateError,
        );
        this.stateManager.connection?.removeEventListener(
          'connectionstatechange',
          onConnectionStateChange,
        );
        this.stateManager.connection?.removeEventListener(
          'iceconnectionstatechange',
          onIceConnectionStateChange,
        );
      };

      this.stateManager.connection.addEventListener(
        'icecandidate',
        onIceCandidate,
      );
      this.stateManager.connection.addEventListener(
        'icecandidateerror',
        onIceCandidateError,
      );
      this.stateManager.connection.addEventListener(
        'connectionstatechange',
        onConnectionStateChange,
      );
      this.stateManager.connection.addEventListener(
        'iceconnectionstatechange',
        onIceConnectionStateChange,
      );

      this.commandsQueue.setupEventListeners(this.stateManager.connection);

      Array.from(this.stateManager.localTrackIdToTrack.values()).forEach(
        (trackContext) =>
          addTrackToConnection(
            trackContext,
            this.stateManager.disabledTrackEncodings,
            this.stateManager.connection,
          ),
      );

      setTransceiversToReadOnly(this.stateManager.connection);
    } else {
      this.stateManager.connection.restartIce();
    }

    this.stateManager.trackIdToSender.forEach((sth) => {
      if (sth.localTrackId) {
        sth.sender = findSender(this.stateManager.connection, sth.localTrackId);
      }
    });

    const tracks = new Map<string, number>(
      Object.entries(offerData.data.tracksTypes),
    );

    addTransceiversIfNeeded(this.stateManager.connection, tracks);

    await this.createAndSendOffer();
  };

  private onRemoteCandidate = (candidate: RTCIceCandidate) => {
    try {
      const iceCandidate = new RTCIceCandidate(candidate);
      if (!this.stateManager.connection) {
        throw new Error(
          'Received new remote candidate but RTCConnection is undefined',
        );
      }
      this.stateManager.connection.addIceCandidate(iceCandidate);
    } catch (error) {
      console.error(error);
    }
  };

  private onLocalCandidate = (event: RTCPeerConnectionIceEvent) => {
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

  private onIceCandidateError = (event: RTCPeerConnectionIceErrorEvent) => {
    console.warn(event);
  };

  private onConnectionStateChange = (event: Event) => {
    switch (this.stateManager.connection?.connectionState) {
      case 'failed':
        this.emit('connectionError', {
          message: 'RTCPeerConnection failed',
          event,
        });
        break;
    }
  };

  private onIceConnectionStateChange = (event: Event) => {
    switch (this.stateManager.connection?.iceConnectionState) {
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
    }
  };
}
