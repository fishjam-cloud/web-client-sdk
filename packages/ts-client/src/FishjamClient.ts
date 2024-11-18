import type {
  BandwidthLimit,
  Encoding,
  Endpoint,
  SerializedMediaEvent,
  SimulcastConfig,
  TrackBandwidthLimit,
  TrackContext,
} from '@fishjam-cloud/webrtc-client';
import { WebRTCEndpoint } from '@fishjam-cloud/webrtc-client';
import type TypedEmitter from 'typed-emitter';
import { EventEmitter } from 'events';
import { PeerMessage } from './protos';
import { ReconnectManager } from './reconnection';
import { isAuthError } from './auth';
import { connectEventsHandler } from './connectEventsHandler';
import { isPeer, isComponent } from './guards';
import type {
  Component,
  ConnectConfig,
  CreateConfig,
  FishjamTrackContext,
  MessageEvents,
  GenericMetadata,
  Peer,
  TrackMetadata,
} from './types';

const STATISTICS_INTERVAL = 10_000;

const WEBSOCKET_PATH = 'socket/peer/websocket';

/**
 * FishjamClient is the main class to interact with Fishjam.
 *
 * @example
 * ```typescript
 * const client = new FishjamClient<PeerMetadata>();
 * const peerToken = "YOUR_PEER_TOKEN";
 *
 * // You can listen to events emitted by the client
 * client.on("joined", (peerId, peersInRoom) => {
 *  console.log("join success");
 * });
 *
 * // Start the peer connection
 * client.connect({
 *  peerMetadata: {},
 *  isSimulcastOn: false,
 *  token: peerToken
 * });
 *
 * // Close the peer connection
 * client.disconnect();
 * ```
 *
 * You can register callbacks to handle the events emitted by the Client.
 *
 * @example
 * ```typescript
 *
 * client.on("trackReady", (ctx) => {
 *  console.log("On track ready");
 * });
 * ```
 */
export class FishjamClient<PeerMetadata = GenericMetadata, ServerMetadata = GenericMetadata> extends (EventEmitter as {
  new <PeerMetadata, ServerMetadata>(): TypedEmitter<MessageEvents<PeerMetadata, ServerMetadata>>;
})<PeerMetadata, ServerMetadata> {
  private websocket: WebSocket | null = null;
  private webrtc: WebRTCEndpoint | null = null;
  private removeEventListeners: (() => void) | null = null;

  public status: 'new' | 'initialized' = 'new';

  private connectConfig: ConnectConfig<PeerMetadata> | null = null;

  private reconnectManager: ReconnectManager<PeerMetadata, ServerMetadata>;

  private sendStatisticsInterval: NodeJS.Timeout | undefined = undefined;

  constructor(config?: CreateConfig) {
    super();
    this.reconnectManager = new ReconnectManager<PeerMetadata, ServerMetadata>(
      this,
      (peerMetadata) => this.initConnection(peerMetadata),
      config?.reconnect,
    );
  }

  /**
   * Uses the {@link !WebSocket} connection and {@link !WebRTCEndpoint | WebRTCEndpoint} to join to the room. Registers the callbacks to
   * handle the events emitted by the {@link !WebRTCEndpoint | WebRTCEndpoint}. Make sure that peer metadata is serializable.
   *
   * @example
   * ```typescript
   * const client = new FishjamClient<PeerMetadata>();
   *
   * client.connect({
   *  peerMetadata: {},
   *  token: peerToken
   * });
   * ```
   *
   * @param {ConnectConfig} config - Configuration object for the client
   */
  public async connect(config: ConnectConfig<PeerMetadata>): Promise<void> {
    this.emit('connectionStarted');
    const result = connectEventsHandler(this);

    this.reconnectManager.reset(config.peerMetadata);
    this.connectConfig = config;

    this.initConnection(config.peerMetadata);

    return result;
  }

  private async initConnection(peerMetadata: PeerMetadata): Promise<void> {
    if (this.status === 'initialized') {
      this.disconnect();
    }

    this.webrtc = new WebRTCEndpoint();

    this.initWebsocket(peerMetadata);
    this.setupCallbacks();

    this.status = 'initialized';
  }

  private getUrl(url: string) {
    if (url.endsWith('/')) return `${url}${WEBSOCKET_PATH}`;
    return `${url}/${WEBSOCKET_PATH}`;
  }

  private initWebsocket(peerMetadata: PeerMetadata) {
    if (!this.connectConfig) throw Error('ConnectConfig is null');

    const { token, url } = this.connectConfig;

    const websocketUrl = this.getUrl(url);

    this.websocket = new WebSocket(websocketUrl);
    this.websocket.binaryType = 'arraybuffer';

    const socketOpenHandler = (event: Event) => {
      this.emit('socketOpen', event);
      const message = PeerMessage.encode({ authRequest: { token } }).finish();
      this.websocket?.send(message);
    };

    const socketErrorHandler = (event: Event) => {
      this.emit('socketError', event);
    };

    const socketCloseHandler = (event: CloseEvent) => {
      if (isAuthError(event.reason)) {
        this.emit('authError', event.reason);
      }

      this.emit('socketClose', event);
    };

    this.websocket.addEventListener('open', socketOpenHandler);
    this.websocket.addEventListener('error', socketErrorHandler);
    this.websocket.addEventListener('close', socketCloseHandler);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageHandler = (event: MessageEvent<any>) => {
      const uint8Array = new Uint8Array(event.data);
      try {
        const data = PeerMessage.decode(uint8Array);
        if (data.authenticated !== undefined) {
          this.emit('authSuccess');

          this.webrtc?.connect(peerMetadata);
        } else if (data.authRequest !== undefined) {
          console.warn('Received unexpected control message: authRequest');
        } else if (data.mediaEvent !== undefined) {
          this.webrtc?.receiveMediaEvent(data.mediaEvent.data);
        }
      } catch (e) {
        console.warn(`Received invalid control message, error: ${e}`);
      }
    };

    this.websocket.addEventListener('message', messageHandler);

    this.removeEventListeners = () => {
      this.websocket?.removeEventListener('open', socketOpenHandler);
      this.websocket?.removeEventListener('error', socketErrorHandler);
      this.websocket?.removeEventListener('close', socketCloseHandler);
      this.websocket?.removeEventListener('message', messageHandler);
    };
  }

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
    return (await this.webrtc?.getStatistics(selector)) ?? new Map();
  }

  /**
   * Returns a snapshot of currently received remote tracks.
   *
   * @example
   * if (client.getRemoteTracks()[trackId]?.simulcastConfig?.enabled) {
   *   client.setTargetTrackEncoding(trackId, encoding);
   * }
   */
  getRemoteTracks(): Readonly<Record<string, FishjamTrackContext>> {
    return (this.webrtc?.getRemoteTracks() as Record<string, FishjamTrackContext>) ?? {};
  }

  /**
   * Returns a snapshot of currently received remote peers.
   */
  public getRemotePeers(): Record<string, Peer<PeerMetadata, ServerMetadata>> {
    return Object.entries(this.webrtc?.getRemoteEndpoints() ?? {}).reduce(
      (acc, [id, peer]) => (isPeer(peer) ? { ...acc, [id]: peer } : acc),
      {},
    );
  }

  public getRemoteComponents(): Record<string, Component> {
    return Object.entries(this.webrtc?.getRemoteEndpoints() ?? {}).reduce(
      (acc, [id, component]) => (isComponent(component) ? { ...acc, [id]: component } : acc),
      {},
    );
  }

  public getLocalPeer(): Peer<PeerMetadata, ServerMetadata> | null {
    return (this.webrtc?.getLocalEndpoint() as Peer<PeerMetadata, ServerMetadata>) || null;
  }

  public getBandwidthEstimation(): bigint {
    if (!this.webrtc) throw Error('Webrtc not initialized');

    return this.webrtc?.getBandwidthEstimation();
  }

  private setupCallbacks() {
    this.webrtc?.on('sendMediaEvent', (mediaEvent: SerializedMediaEvent) => {
      const message = PeerMessage.encode({
        mediaEvent: { data: mediaEvent },
      }).finish();
      this.websocket?.send(message);
    });

    this.webrtc?.on('connected', async (peerId: string, endpointsInRoom: Endpoint[]) => {
      const peers = endpointsInRoom
        .filter((endpoint) => isPeer(endpoint))
        .map((peer) => peer as Peer<PeerMetadata, ServerMetadata>);

      const components = endpointsInRoom
        .filter((endpoint) => isComponent(endpoint))
        .map((component) => component as Component);

      await this.reconnectManager.handleReconnect();

      this.sendStatisticsInterval = setInterval(() => this.sendStatistics(), STATISTICS_INTERVAL);

      this.emit('joined', peerId, peers, components);
    });

    this.webrtc?.on('disconnected', () => {
      this.emit('disconnected');

      clearInterval(this.sendStatisticsInterval);
    });
    this.webrtc?.on('endpointAdded', (endpoint: Endpoint) => {
      if (isPeer(endpoint)) {
        this.emit('peerJoined', endpoint as Peer<PeerMetadata, ServerMetadata>);
      }
      if (isComponent(endpoint)) {
        this.emit('componentAdded', endpoint);
      }
    });
    this.webrtc?.on('endpointRemoved', (endpoint: Endpoint) => {
      if (isPeer(endpoint)) {
        this.emit('peerLeft', endpoint as Peer<PeerMetadata, ServerMetadata>);
      }
      if (isComponent(endpoint)) {
        this.emit('componentRemoved', endpoint);
      }
    });
    this.webrtc?.on('endpointUpdated', (endpoint: Endpoint) => {
      if (isPeer(endpoint)) {
        this.emit('peerUpdated', endpoint as Peer<PeerMetadata, ServerMetadata>);
      }
      if (isComponent(endpoint)) {
        this.emit('componentUpdated', endpoint);
      }
    });
    this.webrtc?.on('trackReady', (ctx: TrackContext) => {
      if (!isPeer(ctx.endpoint)) return;

      this.emit('trackReady', ctx as FishjamTrackContext);
    });
    this.webrtc?.on('trackAdded', (ctx: TrackContext) => {
      if (!isPeer(ctx.endpoint)) return;

      this.emit('trackAdded', ctx as FishjamTrackContext);
    });
    this.webrtc?.on('trackRemoved', (ctx: TrackContext) => {
      if (!isPeer(ctx.endpoint)) return;

      this.emit('trackRemoved', ctx as FishjamTrackContext);
      ctx.removeAllListeners();
    });
    this.webrtc?.on('trackUpdated', (ctx: TrackContext) => {
      if (!isPeer(ctx.endpoint)) return;

      this.emit('trackUpdated', ctx as FishjamTrackContext);
    });
    this.webrtc?.on('tracksPriorityChanged', (enabledTracks, disabledTracks) => {
      this.emit(
        'tracksPriorityChanged',
        enabledTracks as FishjamTrackContext[],
        disabledTracks as FishjamTrackContext[],
      );
    });
    this.webrtc?.on('signalingError', (error) => {
      this.emit('joinError', error);
    });
    this.webrtc?.on('connectionError', (error) => {
      this.emit('connectionError', error);
    });
    this.webrtc?.on('bandwidthEstimationChanged', (estimation: bigint) => {
      this.emit('bandwidthEstimationChanged', estimation);
    });
    this.webrtc?.on('targetTrackEncodingRequested', (event) => {
      this.emit('targetTrackEncodingRequested', event);
    });
    this.webrtc?.on('localTrackAdded', (event) => {
      this.emit('localTrackAdded', event);
    });
    this.webrtc?.on('localTrackRemoved', (event) => {
      this.emit('localTrackRemoved', event);
    });
    this.webrtc?.on('localTrackReplaced', (event) => {
      this.emit('localTrackReplaced', event);
    });
    this.webrtc?.on('localTrackBandwidthSet', (event) => {
      this.emit('localTrackBandwidthSet', event);
    });
    this.webrtc?.on('localTrackMuted', (event) => {
      this.emit('localTrackMuted', event);
    });
    this.webrtc?.on('localTrackUnmuted', (event) => {
      this.emit('localTrackUnmuted', event);
    });
    this.webrtc?.on('localTrackBandwidthSet', (event) => {
      this.emit('localTrackBandwidthSet', event);
    });
    this.webrtc?.on('localTrackEncodingEnabled', (event) => {
      this.emit('localTrackEncodingEnabled', event);
    });
    this.webrtc?.on('localTrackEncodingDisabled', (event) => {
      this.emit('localTrackEncodingDisabled', event);
    });
    this.webrtc?.on('localEndpointMetadataChanged', (event) => {
      this.emit('localPeerMetadataChanged', event);
    });
    this.webrtc?.on('localTrackMetadataChanged', (event) => {
      this.emit('localTrackMetadataChanged', event);
    });
    this.webrtc?.on('disconnectRequested', (event) => {
      this.emit('disconnectRequested', event);
    });
  }

  private async sendStatistics() {
    const statistics = await this.getStatistics();

    const tracksStatistics: Record<string, RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats> = {};

    statistics.forEach((report, key) => {
      if (report.type === 'inbound-rtp' || report.type === 'outbound-rtp') tracksStatistics[key] = report;
    });

    const message = PeerMessage.encode({
      rtcStatsReport: { data: JSON.stringify(tracksStatistics) },
    }).finish();

    this.websocket?.send(message);
  }

  /**
   * Register a callback to be called when the event is emitted.
   * Full list of callbacks can be found here {@link MessageEvents}.
   *
   * @example
   * ```ts
   * const callback = ()=>{  };
   *
   * client.on("onJoinSuccess", callback);
   * ```
   *
   * @param event - Event name from {@link MessageEvents}
   * @param listener - Callback function to be called when the event is emitted
   * @returns This
   */
  public on<E extends keyof MessageEvents<PeerMetadata, ServerMetadata>>(
    event: E,
    listener: MessageEvents<PeerMetadata, ServerMetadata>[E],
  ): this {
    return super.on(event, listener);
  }

  /**
   * Remove a callback from the list of callbacks to be called when the event is emitted.
   *
   * @example
   * ```ts
   * const callback = ()=>{  };
   *
   * client.on("onJoinSuccess", callback);
   *
   * client.off("onJoinSuccess", callback);
   * ```
   *
   * @param event - Event name from {@link MessageEvents}
   * @param listener - Reference to function to be removed from called callbacks
   * @returns This
   */
  public off<E extends keyof MessageEvents<PeerMetadata, ServerMetadata>>(
    event: E,
    listener: MessageEvents<PeerMetadata, ServerMetadata>[E],
  ): this {
    return super.off(event, listener);
  }

  private handleWebRTCNotInitialized() {
    return new Error('WebRTC is not initialized');
  }

  /**
   * Adds track that will be sent to the RTC Engine.
   *
   * @example
   * ```ts
   * const localStream: MediaStream = new MediaStream();
   * try {
   *   const localAudioStream = await navigator.mediaDevices.getUserMedia(
   *     { audio: true }
   *   );
   *   localAudioStream
   *     .getTracks()
   *     .forEach((track) => localStream.addTrack(track));
   * } catch (error) {
   *   console.error("Couldn't get microphone permission:", error);
   * }
   *
   * try {
   *   const localVideoStream = await navigator.mediaDevices.getUserMedia(
   *     { video: true }
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
   *  .forEach((track) => client.addTrack(track, localStream));
   * ```
   *
   * @param track - Audio or video track e.g. from your microphone or camera.
   * @param trackMetadata - Any information about this track that other peers will receive in
   * {@link MessageEvents.peerJoined}. E.g. this can source of the track - wheather it's screensharing, webcam or some
   * other media device.
   * @param simulcastConfig - Simulcast configuration. By default, simulcast is disabled. For more information refer to
   * {@link !SimulcastConfig | SimulcastConfig}.
   * @param maxBandwidth - Maximal bandwidth this track can use. Defaults to 0 which is unlimited. This option has no
   * effect for simulcast and audio tracks. For simulcast tracks use {@link FishjamClient.setTrackBandwidth}.
   * @returns {string} Returns id of added track
   */
  public addTrack(
    track: MediaStreamTrack,
    trackMetadata?: TrackMetadata,
    simulcastConfig: SimulcastConfig = {
      enabled: false,
      activeEncodings: [],
      disabledEncodings: [],
    },
    maxBandwidth: TrackBandwidthLimit = 0, // unlimited bandwidth
  ): Promise<string> {
    if (!this.webrtc) throw this.handleWebRTCNotInitialized();

    return this.webrtc.addTrack(track, trackMetadata, simulcastConfig, maxBandwidth);
  }

  /**
   * Replaces a track that is being sent to the RTC Engine.
   *
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
   *
   * @param {string} trackId - Id of audio or video track to replace.
   * @param {MediaStreamTrack} newTrack - New audio or video track.
   * @returns {Promise<boolean>} Success
   */
  public async replaceTrack(trackId: string, newTrack: MediaStreamTrack | null): Promise<void> {
    if (!this.webrtc) throw this.handleWebRTCNotInitialized();

    return this.webrtc.replaceTrack(trackId, newTrack);
  }

  /**
   * Updates maximum bandwidth for the track identified by trackId. This value directly translates to quality of the
   * stream and, in case of video, to the amount of RTP packets being sent. In case trackId points at the simulcast
   * track bandwidth is split between all of the variant streams proportionally to their resolution.
   *
   * @param {string} trackId
   * @param {BandwidthLimit} bandwidth In kbps
   * @returns {Promise<boolean>} Success
   */
  public async setTrackBandwidth(trackId: string, bandwidth: BandwidthLimit): Promise<boolean> {
    if (!this.webrtc) throw this.handleWebRTCNotInitialized();
    await this.webrtc.setTrackBandwidth(trackId, bandwidth);
    return true;
  }

  /**
   * Updates maximum bandwidth for the given simulcast encoding of the given track.
   *
   * @param {string} trackId - Id of the track
   * @param {string} rid - Rid of the encoding
   * @param {BandwidthLimit} bandwidth - Desired max bandwidth used by the encoding (in kbps)
   * @returns
   */
  public async setEncodingBandwidth(
    trackId: string,
    rid: string,
    bandwidth: BandwidthLimit,
    // todo change type to Promise<void>
  ): Promise<boolean> {
    if (!this.webrtc) throw this.handleWebRTCNotInitialized();
    await this.webrtc.setEncodingBandwidth(trackId, rid, bandwidth);
    return true;
  }

  /**
   * Removes a track from connection that was being sent to the RTC Engine.
   *
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
   *
   * @param {string} trackId - Id of audio or video track to remove.
   */
  public removeTrack(trackId: string) {
    if (!this.webrtc) throw this.handleWebRTCNotInitialized();

    return this.webrtc.removeTrack(trackId);
  }

  /**
   * Sets track encoding that server should send to the client library.
   *
   * The encoding will be sent whenever it is available. If chosen encoding is temporarily unavailable, some other
   * encoding will be sent until chosen encoding becomes active again.
   *
   * @example
   * ```ts
   * webrtc.setTargetTrackEncoding(incomingTrackCtx.trackId, "l")
   * ```
   *
   * @param {string} trackId - Id of track
   * @param {Encoding} encoding - Encoding to receive
   */
  public setTargetTrackEncoding(trackId: string, encoding: Encoding) {
    if (!this.webrtc) throw this.handleWebRTCNotInitialized();

    return this.webrtc.setTargetTrackEncoding(trackId, encoding);
  }

  /**
   * Enables track encoding so that it will be sent to the server.
   *
   * @example
   * ```ts
   * const trackId = webrtc.addTrack(track, stream, {}, {enabled: true, active_encodings: ["l", "m", "h"]});
   * webrtc.disableTrackEncoding(trackId, "l");
   * // wait some time
   * webrtc.enableTrackEncoding(trackId, "l");
   * ```
   *
   * @param {string} trackId - Id of track
   * @param {Encoding} encoding - Encoding that will be enabled
   */
  public enableTrackEncoding(trackId: string, encoding: Encoding) {
    if (!this.webrtc) throw this.handleWebRTCNotInitialized();

    return this.webrtc.enableTrackEncoding(trackId, encoding);
  }

  /**
   * Disables track encoding so that it will be no longer sent to the server.
   *
   * @example
   * ```ts
   * const trackId = webrtc.addTrack(track, stream, {}, {enabled: true, active_encodings: ["l", "m", "h"]});
   * webrtc.disableTrackEncoding(trackId, "l");
   * ```
   *
   * @param {string} trackId - Id of track
   * @param {Encoding} encoding - Encoding that will be disabled
   */
  public disableTrackEncoding(trackId: string, encoding: Encoding) {
    if (!this.webrtc) throw this.handleWebRTCNotInitialized();

    return this.webrtc.disableTrackEncoding(trackId, encoding);
  }

  /**
   * Updates the metadata for the current peer.
   *
   * @param peerMetadata - Data about this peer that other peers will receive upon joining.
   *
   * If the metadata is different from what is already tracked in the room, the event {@link MessageEvents.peerUpdated} will
   * be emitted for other peers in the room.
   */
  public updatePeerMetadata = (peerMetadata: PeerMetadata): void => {
    if (!this.webrtc) throw this.handleWebRTCNotInitialized();

    this.webrtc.updateEndpointMetadata(peerMetadata);
  };

  /**
   * Updates the metadata for a specific track.
   *
   * @param trackId - TrackId (generated in addTrack) of audio or video track.
   * @param trackMetadata - Data about this track that other peers will receive upon joining.
   *
   * If the metadata is different from what is already tracked in the room, the event {@link MessageEvents.trackUpdated} will
   * be emitted for other peers in the room.
   */
  public updateTrackMetadata = (trackId: string, trackMetadata: TrackMetadata): void => {
    if (!this.webrtc) throw this.handleWebRTCNotInitialized();

    this.webrtc.updateTrackMetadata(trackId, trackMetadata);
  };

  public isReconnecting() {
    return this.reconnectManager.isReconnecting();
  }

  /**
   * Leaves the room. This function should be called when user leaves the room in a clean way e.g. by clicking a
   * dedicated, custom button `disconnect`. As a result there will be generated one more media event that should be sent
   * to the RTC Engine. Thanks to it each other peer will be notified that peer left in {@link MessageEvents.peerLeft},
   */
  public leave = () => {
    if (!this.webrtc) throw this.handleWebRTCNotInitialized();

    this.webrtc.disconnect();
  };

  // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
  private isOpen(websocket: WebSocket | null) {
    return websocket?.readyState === 1;
  }

  /**
   * Disconnect from the room, and close the websocket connection. Tries to leave the room gracefully, but if it fails,
   * it will close the websocket anyway.
   *
   * @example
   * ```typescript
   * const client = new FishjamClient<PeerMetadata>();
   *
   * client.connect({ ... });
   *
   * client.disconnect();
   * ```
   */
  public disconnect() {
    try {
      this.webrtc?.removeAllListeners();
      this.webrtc?.disconnect();
      this.webrtc?.cleanUp();
    } catch (e) {
      console.warn(e);
    }
    this.removeEventListeners?.();
    this.removeEventListeners = null;
    if (this.isOpen(this.websocket || null)) {
      this.websocket?.close();
    }
    this.websocket = null;
    this.webrtc = null;
    this.emit('disconnected');
  }

  public cleanup() {
    this.reconnectManager.cleanup();
  }
}
