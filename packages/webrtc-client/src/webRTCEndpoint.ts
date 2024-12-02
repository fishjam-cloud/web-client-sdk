import type { SerializedMediaEvent } from './mediaEvent';
import { deserializeServerMediaEvent, serializePeerMediaEvent } from './mediaEvent';
import type { MediaEvent as PeerMediaEvent } from '@fishjam-cloud/protobufs/peer';
import {
  MediaEvent_Connect,
  MediaEvent_Disconnect,
  MediaEvent_RenegotiateTracks,
  MediaEvent_UpdateTrackMetadata,
} from '@fishjam-cloud/protobufs/peer';
import { v4 as uuidv4 } from 'uuid';
import EventEmitter from 'events';
import type TypedEmitter from 'typed-emitter';
import { Deferred } from './deferred';
import type { BandwidthLimit, TrackBandwidthLimit, TrackContext, WebRTCEndpointEvents } from './types';
import type { EndpointWithTrackContext } from './internal';
import { LocalTrackManager } from './tracks/LocalTrackManager';
import { CommandsQueue } from './CommandsQueue';
import { Remote } from './tracks/Remote';
import { Local } from './tracks/Local';
import { ConnectionManager } from './ConnectionManager';
import type { Variant } from '@fishjam-cloud/protobufs/shared';
import { Candidate } from '@fishjam-cloud/protobufs/shared';
import type {
  MediaEvent_OfferData,
  MediaEvent_SdpAnswer,
  MediaEvent_Track_SimulcastConfig,
  MediaEvent as ServerMediaEvent,
} from '@fishjam-cloud/protobufs/server';

/**
 * Main class that is responsible for connecting to the RTC Engine, sending and receiving media.
 */
export class WebRTCEndpoint extends (EventEmitter as new () => TypedEmitter<Required<WebRTCEndpointEvents>>) {
  private readonly localTrackManager: LocalTrackManager;
  private readonly remote: Remote;
  private readonly local: Local;
  private readonly commandsQueue: CommandsQueue;
  private proposedIceServers: RTCIceServer[] = [];
  public bandwidthEstimation: bigint = BigInt(0);

  public connectionManager?: ConnectionManager;

  private clearConnectionCallbacks: (() => void) | null = null;

  constructor() {
    super();

    const sendEvent = (mediaEvent: PeerMediaEvent) => this.sendMediaEvent(mediaEvent);

    const emit: <E extends keyof Required<WebRTCEndpointEvents>>(
      event: E,
      ...args: Parameters<Required<WebRTCEndpointEvents>[E]>
    ) => void = (events, ...args) => {
      this.emit(events, ...args);
    };

    this.remote = new Remote(emit, sendEvent);
    this.local = new Local(emit, sendEvent);

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
  public connect = (metadata: unknown): void => {
    this.local.setEndpointMetadata(metadata);
    const connect = MediaEvent_Connect.create({ metadataJson: JSON.stringify(metadata) });
    this.sendMediaEvent({ connect });
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
    const deserializedMediaEvent = deserializeServerMediaEvent(mediaEvent);

    if (deserializedMediaEvent.connected) {
      const connectedEvent = deserializedMediaEvent.connected;

      this.proposedIceServers = connectedEvent.iceServers;

      this.local.setLocalEndpointId(connectedEvent.endpointId);

      const localEndpointMetadataJson = connectedEvent.endpointIdToEndpoint[connectedEvent.endpointId]?.metadataJson;
      if (localEndpointMetadataJson) {
        this.local.setEndpointMetadata(JSON.parse(localEndpointMetadataJson));
      }

      const connectedEndpoint = connectedEvent.endpointIdToEndpoint[connectedEvent.endpointId];

      if (connectedEndpoint?.metadataJson) {
        const parsedMetadata = JSON.parse(connectedEndpoint?.metadataJson);
        this.local.setEndpointMetadata(parsedMetadata);
      }

      Object.entries(connectedEvent.endpointIdToEndpoint)
        .filter(([endpointId]) => endpointId !== this.local.getEndpoint().id)
        .forEach(([endpointId, endpoint]) => {
          this.remote.addRemoteEndpoint(endpointId, endpoint.metadataJson, endpoint.trackIdToTrack);
        });

      const remoteEndpoints = Object.values(this.remote.getRemoteEndpoints());

      this.emit('connected', this.local.getEndpoint().id, remoteEndpoints);

      return;
    }

    if (this.getEndpointId()) await this.handleMediaEvent(deserializedMediaEvent);
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
  public getRemoteTracks(): Record<string, TrackContext> {
    return this.remote.getRemoteTrackContexts();
  }

  /**
   * Returns a snapshot of currently received remote endpoints.
   */
  public getRemoteEndpoints(): Record<string, EndpointWithTrackContext> {
    return this.remote.getRemoteEndpoints();
  }

  public getLocalEndpoint(): EndpointWithTrackContext {
    return this.local.getEndpoint();
  }

  public getBandwidthEstimation(): bigint {
    return this.bandwidthEstimation;
  }

  private handleMediaEvent = async (event: ServerMediaEvent) => {
    if (event.offerData) {
      await this.onOfferData(event.offerData);
    } else if (event.tracksAdded) {
      this.localTrackManager.ongoingRenegotiation = true;

      const { trackIdToTrack, endpointId } = event.tracksAdded;
      if (this.getEndpointId() === endpointId) return;

      this.remote.addTracks(endpointId, trackIdToTrack);
    } else if (event.tracksRemoved) {
      this.localTrackManager.ongoingRenegotiation = true;

      const { endpointId, trackIds } = event.tracksRemoved;

      if (this.getEndpointId() === endpointId) return;

      this.remote.removeTracks(trackIds);
    } else if (event.sdpAnswer) {
      this.localTrackManager.ongoingRenegotiation = false;
      await this.onSdpAnswer(event.sdpAnswer);
      this.commandsQueue.processNextCommand();
    } else if (event.candidate) {
      await this.onRemoteCandidate(event.candidate);
    } else if (event.endpointAdded) {
      const { endpointId, metadataJson } = event.endpointAdded;
      if (endpointId === this.getEndpointId()) return;

      this.remote.addRemoteEndpoint(endpointId, metadataJson);
    } else if (event.endpointRemoved) {
      const { endpointId } = event.endpointRemoved;

      if (endpointId === this.local.getEndpoint().id) {
        this.cleanUp();
        this.emit('disconnected');
        return;
      }

      if (this.getEndpointId() === endpointId) return;

      this.remote.removeRemoteEndpoint(endpointId);
    } else if (event.endpointUpdated) {
      const { endpointId, metadataJson } = event.endpointUpdated;
      if (this.getEndpointId() === endpointId) return;

      this.remote.updateRemoteEndpoint(endpointId, metadataJson);
    } else if (event.trackUpdated) {
      const { endpointId, trackId, metadataJson } = event.trackUpdated;
      if (this.getEndpointId() === endpointId) return;

      this.remote.updateRemoteTrack(endpointId, trackId, metadataJson);
    } else if (event.vadNotification) {
      const { trackId, status } = event.vadNotification;
      this.remote.setRemoteTrackVadStatus(trackId, status);
    } else if (event.error) {
      console.warn('signaling error', {
        message: event.error.message,
      });

      this.emit('signalingError', {
        message: event.error.message,
      });

      this.disconnect();
    } else if (event.trackVariantSwitched) {
      const { trackId, variant } = event.trackVariantSwitched;
      this.remote.setRemoteTrackEncoding(trackId, variant);
    } else if (event.trackVariantEnabled) {
      const { trackId, variant } = event.trackVariantEnabled;
      this.remote.enableRemoteTrackEncoding(trackId, variant);
    } else if (event.trackVariantDisabled) {
      const { trackId, variant } = event.trackVariantDisabled;
      this.remote.disableRemoteTrackEncoding(trackId, variant);
    }
  };

  private onSdpAnswer = async (data: MediaEvent_SdpAnswer) => {
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
          const updateTrackMetadata = MediaEvent_UpdateTrackMetadata.create({
            trackId: localTrack.id,
            metadataJson: JSON.stringify(trackContext.metadata),
          });
          this.sendMediaEvent({ updateTrackMetadata });
        }

        trackContext.pendingMetadataUpdate = false;
      });

    if (!this.connectionManager) throw new Error(`There is no active RTCPeerConnection`);

    // probably there is no need to reassign it on every onAnswer
    this.connectionManager.setOnTrackReady((event) => {
      this.onTrackReady(event);
    });

    try {
      await this.connectionManager.setRemoteDescription({ sdp: data.sdp, type: 'answer' });
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
    trackMetadata?: unknown,
    simulcastConfig: MediaEvent_Track_SimulcastConfig = {
      enabled: false,
      enabledVariants: [],
      disabledVariants: [],
    },
    maxBandwidth: TrackBandwidthLimit = 0,
  ): Promise<string> {
    const resolutionNotifier = new Deferred<void>();
    const trackId = this.getTrackId(uuidv4());
    const stream = new MediaStream();

    try {
      stream.addTrack(track);

      this.commandsQueue.pushCommand({
        handler: async () =>
          this.localTrackManager.addTrackHandler(trackId, track, stream, trackMetadata, simulcastConfig, maxBandwidth),
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
      trackMetadata,
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
      handler: () => this.localTrackManager.replaceTrackHandler(this, trackId, newTrack),
      resolutionNotifier,
      resolve: 'on-handler-resolve',
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
  public async setEncodingBandwidth(trackId: string, rid: Variant, bandwidth: BandwidthLimit): Promise<void> {
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
      handler: async () => this.localTrackManager.removeTrackHandler(trackId),
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
  public setTargetTrackEncoding(trackId: string, variant: Variant) {
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
  public enableTrackEncoding = async (trackId: string, encoding: Variant) => {
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
  public disableTrackEncoding = async (trackId: string, encoding: Variant) => {
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
    const disconnect = MediaEvent_Disconnect.create();
    this.sendMediaEvent({ disconnect });
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

  private sendMediaEvent = (mediaEvent: PeerMediaEvent) => {
    this.emit('sendMediaEvent', serializePeerMediaEvent(mediaEvent));
  };

  private async createAndSendOffer() {
    const connection = this.connectionManager;

    if (!connection) return;

    try {
      this.localTrackManager.updateSenders();

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
      const sdpOffer = this.local.createSdpOfferEvent(offer);

      this.sendMediaEvent({ sdpOffer });

      this.local.setLocalTrackStatusToOffered();
    } catch (error) {
      console.error(error);
    }
  }

  private onOfferData = async (offerData: MediaEvent_OfferData) => {
    const connectionManager = this.connectionManager ?? this.createNewConnection();

    if (offerData.tracksTypes) {
      connectionManager.addTransceiversIfNeeded(offerData.tracksTypes);
    }

    await this.createAndSendOffer();
  };

  private setupConnectionListeners = (connection: RTCPeerConnection) => {
    const onIceCandidate = (event: RTCPeerConnectionIceEvent) => this.onLocalCandidate(event);
    const onIceCandidateError = (event: RTCPeerConnectionIceErrorEvent) => this.onIceCandidateError(event);
    const onConnectionStateChange = (event: Event) => this.onConnectionStateChange(event);
    const onIceConnectionStateChange = (event: Event) => this.onIceConnectionStateChange(event);

    this.clearConnectionCallbacks = () => {
      connection.removeEventListener('icecandidate', onIceCandidate);
      connection.removeEventListener('icecandidateerror', onIceCandidateError);
      connection.removeEventListener('connectionstatechange', onConnectionStateChange);
      connection.removeEventListener('iceconnectionstatechange', onIceConnectionStateChange);
    };

    connection.addEventListener('icecandidate', onIceCandidate);
    connection.addEventListener('icecandidateerror', onIceCandidateError);
    connection.addEventListener('connectionstatechange', onConnectionStateChange);
    connection.addEventListener('iceconnectionstatechange', onIceConnectionStateChange);
  };

  private createNewConnection = () => {
    const connectionManager = new ConnectionManager(this.proposedIceServers);

    this.localTrackManager.updateConnection(connectionManager);
    this.local.updateConnection(connectionManager);

    this.setupConnectionListeners(connectionManager.getConnection());

    this.commandsQueue.initConnection(connectionManager);

    this.local.addAllTracksToConnection();

    this.connectionManager = connectionManager;

    return connectionManager;
  };

  private onRemoteCandidate = async (candidate: Candidate) => {
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
    if (!event.candidate) return;

    const candidate = Candidate.create({
      candidate: event.candidate.candidate,
      sdpMLineIndex: event.candidate.sdpMLineIndex ?? undefined,
      sdpMid: event.candidate.sdpMid ?? undefined,
      usernameFragment: event.candidate.usernameFragment ?? undefined,
    });

    this.sendMediaEvent({ candidate });
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
        this.sendMediaEvent({ renegotiateTracks: MediaEvent_RenegotiateTracks.create() });
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
