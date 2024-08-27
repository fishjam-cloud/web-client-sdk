import type { MediaEvent, SerializedMediaEvent } from './mediaEvent';
import { deserializeMediaEvent, generateCustomEvent, generateMediaEvent, serializeMediaEvent } from './mediaEvent';
import { v4 as uuidv4 } from 'uuid';
import EventEmitter from 'events';
import type TypedEmitter from 'typed-emitter';
import { Deferred } from './deferred';
import type {
  BandwidthLimit,
  Config,
  Encoding,
  MetadataParser,
  SimulcastConfig,
  TrackBandwidthLimit,
  TrackContext,
  WebRTCEndpointEvents,
} from './types';
import { isEncoding } from './types';
import type { EndpointWithTrackContext } from './internal';
import { LocalTrackManager } from './tracks/LocalTrackManager';
import { CommandsQueue } from './CommandsQueue';
import { Remote } from './tracks/Remote';
import { Local } from './tracks/Local';
import type { TurnServer } from './ConnectionManager';
import { ConnectionManager } from './ConnectionManager';

/**
 * Main class that is responsible for connecting to the RTC Engine, sending and receiving media.
 */
export class WebRTCEndpoint<EndpointMetadata = any, TrackMetadata = any> extends (EventEmitter as {
  new <EndpointMetadata, TrackMetadata>(): TypedEmitter<
    Required<WebRTCEndpointEvents<EndpointMetadata, TrackMetadata>>
  >;
})<EndpointMetadata, TrackMetadata> {
  private readonly endpointMetadataParser: MetadataParser<EndpointMetadata>;
  private readonly trackMetadataParser: MetadataParser<TrackMetadata>;

  private readonly localTrackManager: LocalTrackManager<EndpointMetadata, TrackMetadata>;
  private readonly remote: Remote<EndpointMetadata, TrackMetadata>;
  private readonly local: Local<EndpointMetadata, TrackMetadata>;
  private readonly commandsQueue: CommandsQueue<EndpointMetadata, TrackMetadata>;
  public bandwidthEstimation: bigint = BigInt(0);

  public connectionManager?: ConnectionManager;

  private clearConnectionCallbacks: (() => void) | null = null;

  constructor(config?: Config<EndpointMetadata, TrackMetadata>) {
    super();
    this.endpointMetadataParser = config?.endpointMetadataParser ?? ((x) => x as EndpointMetadata);
    this.trackMetadataParser = config?.trackMetadataParser ?? ((x) => x as TrackMetadata);

    const sendEvent = (mediaEvent: MediaEvent) => this.sendMediaEvent(mediaEvent);

    const emit: <E extends keyof Required<WebRTCEndpointEvents<EndpointMetadata, TrackMetadata>>>(
      event: E,
      ...args: Parameters<Required<WebRTCEndpointEvents<EndpointMetadata, TrackMetadata>>[E]>
    ) => void = (events, ...args) => {
      this.emit(events, ...args);
    };

    this.remote = new Remote<EndpointMetadata, TrackMetadata>(
      emit,
      sendEvent,
      this.endpointMetadataParser,
      this.trackMetadataParser,
    );
    this.local = new Local<EndpointMetadata, TrackMetadata>(
      emit,
      sendEvent,
      this.endpointMetadataParser,
      this.trackMetadataParser,
    );

    this.localTrackManager = new LocalTrackManager(this.local, sendEvent);

    this.commandsQueue = new CommandsQueue(this.localTrackManager);
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
    this.local.setEndpointMetadata(metadata);
    const mediaEvent = generateMediaEvent('connect', {
      metadata: metadata,
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
  public receiveMediaEvent = async (mediaEvent: SerializedMediaEvent) => {
    const deserializedMediaEvent = deserializeMediaEvent(mediaEvent);
    switch (deserializedMediaEvent.type) {
      case 'connected': {
        this.local.setLocalEndpointId(deserializedMediaEvent.data.id);

        const endpoints = deserializedMediaEvent.data.otherEndpoints as EndpointWithTrackContext<
          EndpointMetadata,
          TrackMetadata
        >[];

        // todo implement track mapping (+ validate metadata)
        // todo implement endpoint metadata mapping
        endpoints.forEach((endpoint) => {
          this.remote.addRemoteEndpoint(endpoint);
        });

        const remoteEndpoints = Object.values(this.remote.getRemoteEndpoints());

        this.emit('connected', this.local.getEndpoint().id, remoteEndpoints);

        break;
      }
      default:
        if (this.getEndpointId() != null) await this.handleMediaEvent(deserializedMediaEvent);
    }
  };

  private getEndpointId = () => this.local.getEndpoint().id;

  private onTrackReady = (event: RTCTrackEvent) => {
    const stream = event.streams[0];
    if (!stream) throw new Error('Cannot find media stream');

    const mid = event.transceiver.mid!;

    const remoteTrack = this.remote.getTrackByMid(mid);

    remoteTrack.setReady(stream, event.track);

    this.emit('trackReady', remoteTrack.trackContext);
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
  public async getStatistics(selector?: MediaStreamTrack | null): Promise<RTCStatsReport> {
    return (await this.connectionManager?.getConnection().getStats(selector)) ?? new Map();
  }

  /**
   * Returns a snapshot of currently received remote tracks.
   *
   * @example
   * if (webRTCEndpoint.getRemoteTracks()[trackId]?.simulcastConfig?.enabled) {
   *   webRTCEndpoint.setTargetTrackEncoding(trackId, encoding);
   * }
   */
  public getRemoteTracks(): Record<string, TrackContext<EndpointMetadata, TrackMetadata>> {
    return this.remote.getRemoteTrackContexts();
  }

  /**
   * Returns a snapshot of currently received remote endpoints.
   */
  public getRemoteEndpoints(): Record<string, EndpointWithTrackContext<EndpointMetadata, TrackMetadata>> {
    return this.remote.getRemoteEndpoints();
  }

  public getLocalEndpoint(): EndpointWithTrackContext<EndpointMetadata, TrackMetadata> {
    return this.local.getEndpoint();
  }

  public getBandwidthEstimation(): bigint {
    return this.bandwidthEstimation;
  }

  private handleMediaEvent = async (deserializedMediaEvent: MediaEvent) => {
    switch (deserializedMediaEvent.type) {
      case 'offerData': {
        await this.onOfferData(deserializedMediaEvent);
        break;
      }
      case 'tracksAdded': {
        this.localTrackManager.ongoingRenegotiation = true;
        const data = deserializedMediaEvent.data;

        if (this.getEndpointId() === data.endpointId) return;

        this.remote.addTracks(data.endpointId, data.tracks, data.trackIdToMetadata);
        break;
      }
      case 'tracksRemoved': {
        this.localTrackManager.ongoingRenegotiation = true;

        const data = deserializedMediaEvent.data;

        const endpointId = data.endpointId;
        if (this.getEndpointId() === endpointId) return;

        this.remote.removeTracks(data.trackIds as string[]);
        break;
      }

      case 'sdpAnswer':
        await this.onSdpAnswer(deserializedMediaEvent.data);

        this.localTrackManager.ongoingRenegotiation = false;
        this.commandsQueue.processNextCommand();
        break;

      case 'candidate':
        await this.onRemoteCandidate(deserializedMediaEvent.data);
        break;

      case 'endpointAdded':
        const endpoint = deserializedMediaEvent.data;

        if (endpoint.id === this.getEndpointId()) return;

        this.remote.addRemoteEndpoint(endpoint);
        break;

      case 'endpointRemoved':
        if (deserializedMediaEvent.data.id === this.local.getEndpoint().id) {
          this.cleanUp();
          this.emit('disconnected');
          return;
        }

        if (this.getEndpointId() === deserializedMediaEvent.data.id) return;

        this.remote.removeRemoteEndpoint(deserializedMediaEvent.data.id);
        break;

      case 'endpointUpdated':
        if (this.getEndpointId() === deserializedMediaEvent.data.id) return;

        this.remote.updateRemoteEndpoint(deserializedMediaEvent.data);
        break;

      case 'trackUpdated': {
        if (this.getEndpointId() === deserializedMediaEvent.data.endpointId) return;

        this.remote.updateRemoteTrack(deserializedMediaEvent.data);
        break;
      }

      case 'trackEncodingDisabled': {
        if (this.getEndpointId() === deserializedMediaEvent.data.endpointId) return;

        this.remote.disableRemoteTrackEncoding(
          deserializedMediaEvent.data.trackId,
          deserializedMediaEvent.data.encoding,
        );
        break;
      }

      case 'trackEncodingEnabled': {
        const data = deserializedMediaEvent.data;

        if (this.getEndpointId() === data.endpointId) return;

        this.remote.enableRemoteTrackEncoding(data.trackId, data.encoding);
        break;
      }

      case 'encodingSwitched': {
        const data = deserializedMediaEvent.data;

        this.remote.setRemoteTrackEncoding(data.trackId, data.encoding, data.reason);
        break;
      }
      case 'custom':
        await this.handleMediaEvent(deserializedMediaEvent.data as MediaEvent);
        break;

      case 'error':
        this.emit('signalingError', {
          message: deserializedMediaEvent.data.message,
        });

        this.disconnect();
        break;

      case 'vadNotification': {
        this.remote.setRemoteTrackVadStatus(deserializedMediaEvent.data.trackId, deserializedMediaEvent.data.status);
        break;
      }

      case 'bandwidthEstimation': {
        this.bandwidthEstimation = deserializedMediaEvent.data.estimation;

        this.emit('bandwidthEstimationChanged', this.bandwidthEstimation);
        break;
      }

      default:
        console.warn('Received unknown media event: ', deserializedMediaEvent.type);
        break;
    }
  };

  private onSdpAnswer = async (data: any) => {
    this.remote.updateMLineIds(data.midToTrackId);
    this.local.updateMLineIds(data.midToTrackId);

    Object.keys(data.midToTrackId)
      .map((mid) => {
        if (!mid) throw new Error('TrackId is not defined');

        return mid;
      })
      .map((mid) => this.local.getTrackByMidOrNull(mid))
      .filter((localTrack) => localTrack !== null)
      .forEach((localTrack) => {
        const trackContext = localTrack.trackContext;

        trackContext.negotiationStatus = 'done';

        if (trackContext.pendingMetadataUpdate) {
          const mediaEvent = generateMediaEvent('updateTrackMetadata', {
            trackId: localTrack.id,
            trackMetadata: trackContext.metadata,
          });
          this.sendMediaEvent(mediaEvent);
        }

        trackContext.pendingMetadataUpdate = false;
      });

    if (!this.connectionManager) throw new Error(`There is no active RTCPeerConnection`);

    // probably there is no need to reassign it on every onAnswer
    this.connectionManager.setOnTrackReady((event) => {
      this.onTrackReady(event);
    });

    try {
      await this.connectionManager.setRemoteDescription(data);
      await this.local.disableAllLocalTrackEncodings();
    } catch (err) {
      console.error(err);
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
  public async addTrack(
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
          this.localTrackManager.addTrackHandler(trackId, track, stream, parsedMetadata, simulcastConfig, maxBandwidth);
        },
        parse: () => this.localTrackManager.parseAddTrack(track, simulcastConfig, maxBandwidth),
        resolve: 'after-renegotiation',
        resolutionNotifier,
      });
    } catch (error) {
      resolutionNotifier.reject(error);
    }
    await resolutionNotifier.promise;
    this.emit('localTrackAdded', {
      trackId,
      track,
      stream,
      trackMetadata: metadata,
      simulcastConfig,
      maxBandwidth,
    });
    return trackId;
  }

  /**
   * Replaces a track that is being sent to the RTC Engine.
   * @param trackId - Audio or video track.
   * @param {string} trackId - Id of audio or video track to replace.
   * @param {MediaStreamTrack} newTrack
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
  public async replaceTrack(trackId: string, newTrack: MediaStreamTrack | null): Promise<void> {
    const resolutionNotifier = new Deferred<void>();

    this.commandsQueue.pushCommand({
      handler: () => {
        this.localTrackManager.replaceTrackHandler(this, trackId, newTrack);
      },
      resolutionNotifier,
      resolve: 'immediately',
    });

    return resolutionNotifier.promise.then(() => {
      this.emit('localTrackReplaced', { trackId, track: newTrack });
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
  public setTrackBandwidth(trackId: string, bandwidth: BandwidthLimit): Promise<void> {
    if (!this.connectionManager) throw new Error(`There is no active RTCPeerConnection`);

    return this.local.setTrackBandwidth(trackId, bandwidth);
  }

  /**
   * Updates maximum bandwidth for the given simulcast encoding of the given track.
   *
   * @param {string} trackId - id of the track
   * @param {string} rid - rid of the encoding
   * @param {BandwidthLimit} bandwidth - desired max bandwidth used by the encoding (in kbps)
   * @returns
   */
  public async setEncodingBandwidth(trackId: string, rid: string, bandwidth: BandwidthLimit): Promise<void> {
    if (!isEncoding(rid)) throw new Error(`Rid is invalid ${rid}`);

    if (!this.connectionManager) throw new Error(`There is no active RTCPeerConnection`);

    return await this.local.setEncodingBandwidth(trackId, rid, bandwidth);
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
  public async removeTrack(trackId: string): Promise<void> {
    const resolutionNotifier = new Deferred<void>();

    this.commandsQueue.pushCommand({
      handler: () => {
        this.localTrackManager.removeTrackHandler(trackId);
      },
      resolutionNotifier,
      resolve: 'after-renegotiation',
    });

    await resolutionNotifier.promise;

    this.emit('localTrackRemoved', {
      trackId,
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
   * @param {Encoding} variant - variant to receive
   * @example
   * ```ts
   * webrtc.setTargetTrackEncoding(incomingTrackCtx.trackId, "l")
   * ```
   */
  public setTargetTrackEncoding(trackId: string, variant: Encoding) {
    this.remote.setTargetRemoteTrackEncoding(trackId, variant);
  }

  /**
   * Enables track encoding so that it will be sent to the server.
   * @param {string} trackId - id of track
   * @param {Encoding} encoding - encoding that will be enabled
   * @example
   * ```ts
   * const trackId = webrtc.addTrack(track, stream, {}, {enabled: true, activeEncodings: ["l", "m", "h"]});
   * webrtc.disableTrackEncoding(trackId, "l");
   * // wait some time
   * webrtc.enableTrackEncoding(trackId, "l");
   * ```
   */
  public enableTrackEncoding = async (trackId: string, encoding: Encoding) => {
    await this.local.enableLocalTrackEncoding(trackId, encoding);
  };

  /**
   * Disables track encoding so that it will be no longer sent to the server.
   * @param {string} trackId - id of track
   * @param {Encoding} encoding - encoding that will be disabled
   * @example
   * ```ts
   * const trackId = webrtc.addTrack(track, stream, {}, {enabled: true, activeEncodings: ["l", "m", "h"]});
   * webrtc.disableTrackEncoding(trackId, "l");
   * ```
   */
  public disableTrackEncoding = async (trackId: string, encoding: Encoding) => {
    await this.local.disableLocalTrackEncoding(trackId, encoding);
  };

  /**
   * Updates the metadata for the current endpoint.
   * @param metadata - Data about this endpoint that other endpoints will receive upon being added.
   *
   * If the metadata is different from what is already tracked in the room, the optional
   * event `endpointUpdated` will be emitted for other endpoint in the room.
   */
  public updateEndpointMetadata = (metadata: any): void => {
    this.local.updateEndpointMetadata(metadata);
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
    this.local.updateLocalTrackMetadata(trackId, trackMetadata);
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
    if (this.connectionManager) {
      this.clearConnectionCallbacks?.();
      this.connectionManager?.getConnection().close();

      this.commandsQueue.cleanUp();
      this.localTrackManager.cleanUp();
    }

    this.connectionManager = undefined;
  };

  private getTrackId(uuid: string): string {
    return `${this.getEndpointId()}:${uuid}`;
  }

  // todo change to private
  public sendMediaEvent = (mediaEvent: MediaEvent) => {
    const serializedMediaEvent = serializeMediaEvent(mediaEvent);
    this.emit('sendMediaEvent', serializedMediaEvent);
  };

  private async createAndSendOffer() {
    const connection = this.connectionManager;
    if (!connection) return;

    try {
      const offer = await connection.getConnection().createOffer();

      if (!this.connectionManager) {
        console.warn('RTCPeerConnection stopped or restarted');
        return;
      }
      await connection.getConnection().setLocalDescription(offer);

      if (!this.connectionManager) {
        console.warn('RTCPeerConnection stopped or restarted');
        return;
      }

      const mediaEvent = this.local.createSdpOfferEvent(offer);
      this.sendMediaEvent(mediaEvent);

      this.local.setLocalTrackStatusToOffered();
    } catch (error) {
      console.error(error);
    }
  }

  private onOfferData = async (offerData: MediaEvent) => {
    const connection = this.connectionManager;

    if (connection) {
      connection.getConnection().restartIce();
    } else {
      this.setConnection(offerData.data.integratedTurnServers);

      const onIceCandidate = (event: RTCPeerConnectionIceEvent) => this.onLocalCandidate(event);
      const onIceCandidateError = (event: RTCPeerConnectionIceErrorEvent) => this.onIceCandidateError(event);
      const onConnectionStateChange = (event: Event) => this.onConnectionStateChange(event);
      const onIceConnectionStateChange = (event: Event) => this.onIceConnectionStateChange(event);

      const connection = this.connectionManager;
      if (!connection) throw new Error(`There is no active RTCPeerConnection`);

      this.clearConnectionCallbacks = () => {
        connection?.getConnection()?.removeEventListener('icecandidate', onIceCandidate);
        connection?.getConnection()?.removeEventListener('icecandidateerror', onIceCandidateError);
        connection?.getConnection()?.removeEventListener('connectionstatechange', onConnectionStateChange);
        connection?.getConnection()?.removeEventListener('iceconnectionstatechange', onIceConnectionStateChange);
      };

      connection.getConnection().addEventListener('icecandidate', onIceCandidate);
      connection.getConnection().addEventListener('icecandidateerror', onIceCandidateError);
      connection.getConnection().addEventListener('connectionstatechange', onConnectionStateChange);
      connection.getConnection().addEventListener('iceconnectionstatechange', onIceConnectionStateChange);

      this.commandsQueue.initConnection(connection);

      this.local.addAllTracksToConnection();

      connection.setTransceiversToReadOnly();
    }

    this.localTrackManager.updateSenders();

    const tracks = new Map<string, number>(Object.entries(offerData.data.tracksTypes));

    this.connectionManager?.addTransceiversIfNeeded(tracks);

    await this.createAndSendOffer();
  };

  private setConnection = (turnServers: TurnServer[]) => {
    this.connectionManager = new ConnectionManager(turnServers);

    this.localTrackManager.updateConnection(this.connectionManager);
    this.local.updateConnection(this.connectionManager);
  };

  private onRemoteCandidate = async (candidate: RTCIceCandidate) => {
    try {
      const iceCandidate = new RTCIceCandidate(candidate);
      if (!this.connectionManager) {
        throw new Error('Received new remote candidate but RTCConnection is undefined');
      }
      await this.connectionManager.addIceCandidate(iceCandidate);
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
    switch (this.localTrackManager.connection?.getConnection().connectionState) {
      case 'failed':
        this.emit('connectionError', {
          message: 'RTCPeerConnection failed',
          event,
        });
        break;
    }
  };

  private onIceConnectionStateChange = (event: Event) => {
    switch (this.localTrackManager.connection?.getConnection().iceConnectionState) {
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
