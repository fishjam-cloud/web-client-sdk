import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import type {
  AuthErrorReason,
  BandwidthLimit,
  Component,
  CreateConfig,
  MessageEvents,
  Peer,
  ReconnectionStatus,
  SimulcastConfig,
  TrackBandwidthLimit,
  TrackContext,
  Encoding,
} from "@fishjam-cloud/ts-client";
import { FishjamClient } from "@fishjam-cloud/ts-client";
import type { PeerId, PeerState, PeerStatus, Track, TrackId, TrackWithOrigin } from "./state.types";
import type {
  ConnectConfig,
  DeviceManagerConfig,
  DeviceManagerInitConfig,
  DeviceManagerStartConfig,
  Devices,
  DeviceState,
  MediaDeviceType,
  MediaState,
  PeerMetadata,
  TrackMetadata,
  TrackType,
} from "./types";
import type { DeviceManagerEvents } from "./DeviceManager";
import { DeviceManager } from "./DeviceManager";
import { getAvailableMedia, getCorrectedResult } from "./mediaInitializer";

export type ClientApi = {
  local: PeerState | null;

  peers: Record<PeerId, PeerState>;
  peersTracks: Record<TrackId, TrackWithOrigin>;

  components: Record<PeerId, PeerState>;
  componentsTracks: Record<TrackId, TrackWithOrigin>;

  bandwidthEstimation: bigint;
  status: PeerStatus;
  media: MediaState | null;
  devices: Devices;

  isReconnecting: () => boolean;
};

type DeviceTypeInfo = {
  mediaDeviceType: MediaDeviceType;
  trackType: TrackType;
};

export interface ClientEvents {
  /**
   * Emitted when the websocket connection is closed
   *
   * @param {CloseEvent} event - Close event object from the websocket
   */
  socketClose: (event: CloseEvent, client: ClientApi) => void;

  /**
   * Emitted when occurs an error in the websocket connection
   *
   * @param {Event} event - Event object from the websocket
   */
  socketError: (event: Event, client: ClientApi) => void;

  /**
   * Emitted when the websocket connection is opened
   *
   * @param {Event} event - Event object from the websocket
   */
  socketOpen: (event: Event, client: ClientApi) => void;

  /** Emitted when authentication is successful */
  authSuccess: (client: ClientApi) => void;

  /** Emitted when authentication fails */
  authError: (reason: AuthErrorReason, client: ClientApi) => void;

  /** Emitted when the connection is closed */
  disconnected: (client: ClientApi) => void;

  /** Emitted on successful reconnection */
  reconnected: (client: ClientApi) => void;

  /** Emitted when the process of reconnection starts */
  reconnectionStarted: (client: ClientApi) => void;

  /** Emitted when the maximum number of reconnection retries is reached */
  reconnectionRetriesLimitReached: (client: ClientApi) => void;

  /**
   * Called when peer was accepted.
   */
  joined: (
    event: {
      peerId: string;
      peers: Peer<PeerMetadata, TrackMetadata>[];
      components: Component<PeerMetadata, TrackMetadata>[];
    },
    client: ClientApi,
  ) => void;

  /**
   * Called when peer was not accepted
   * @param metadata - Pass through for client application to communicate further actions to frontend
   */
  joinError: (metadata: any, client: ClientApi) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

  /**
   * Called when data in a new track arrives.
   *
   * This callback is always called after {@link MessageEvents.trackAdded}.
   * It informs user that data related to the given track arrives and can be played or displayed.
   */
  trackReady: (ctx: TrackContext<PeerMetadata, TrackMetadata>, client: ClientApi) => void;

  /**
   * Called each time the peer which was already in the room, adds new track. Fields track and stream will be set to null.
   * These fields will be set to non-null value in {@link MessageEvents.trackReady}
   */
  trackAdded: (ctx: TrackContext<PeerMetadata, TrackMetadata>, client: ClientApi) => void;

  /**
   * Called when some track will no longer be sent.
   *
   * It will also be called before {@link MessageEvents.peerLeft} for each track of this peer.
   */
  trackRemoved: (ctx: TrackContext<PeerMetadata, TrackMetadata>, client: ClientApi) => void;

  /**
   * Called each time peer has its track metadata updated.
   */
  trackUpdated: (ctx: TrackContext<PeerMetadata, TrackMetadata>, client: ClientApi) => void;

  /**
   * Called each time new peer joins the room.
   */
  peerJoined: (peer: Peer<PeerMetadata, TrackMetadata>, client: ClientApi) => void;

  /**
   * Called each time peer leaves the room.
   */
  peerLeft: (peer: Peer<PeerMetadata, TrackMetadata>, client: ClientApi) => void;

  /**
   * Called each time peer has its metadata updated.
   */
  peerUpdated: (peer: Peer<PeerMetadata, TrackMetadata>, client: ClientApi) => void;

  /**
   * Called each time new Component is added to the room.
   */
  componentAdded: (peer: Component<PeerMetadata, TrackMetadata>, client: ClientApi) => void;

  /**
   * Called each time Component is removed from the room.
   */
  componentRemoved: (peer: Component<PeerMetadata, TrackMetadata>, client: ClientApi) => void;

  /**
   * Called each time Component has its metadata updated.
   */
  componentUpdated: (peer: Component<PeerMetadata, TrackMetadata>, client: ClientApi) => void;

  /**
   * Called in case of errors related to multimedia session e.g. ICE connection.
   */
  connectionError: (
    error: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["connectionError"]>[0],
    client: ClientApi,
  ) => void;

  /**
   * Called every time the server estimates client's bandiwdth.
   *
   * @param {bigint} estimation - client's available incoming bitrate estimated
   * by the server. It's measured in bits per second.
   */
  bandwidthEstimationChanged: (estimation: bigint, client: ClientApi) => void;

  // track context events
  encodingChanged: (context: TrackContext<PeerMetadata, TrackMetadata>, client: ClientApi) => void;

  /**
   * Emitted every time an update about voice activity is received from the server.
   */
  voiceActivityChanged: (context: TrackContext<PeerMetadata, TrackMetadata>, client: ClientApi) => void;

  // device manager events
  managerStarted: (
    event: Parameters<DeviceManagerEvents["managerInitialized"]>[0] & DeviceTypeInfo,
    client: ClientApi,
  ) => void;
  managerInitialized: (event: { audio?: DeviceState; video?: DeviceState }, client: ClientApi) => void;
  deviceReady: (event: Parameters<DeviceManagerEvents["deviceReady"]>[0] & DeviceTypeInfo, client: ClientApi) => void;
  devicesStarted: (
    event: Parameters<DeviceManagerEvents["devicesStarted"]>[0] & DeviceTypeInfo,
    client: ClientApi,
  ) => void;
  devicesReady: (event: Parameters<DeviceManagerEvents["devicesReady"]>[0] & DeviceTypeInfo, client: ClientApi) => void;
  deviceStopped: (event: DeviceTypeInfo, client: ClientApi) => void;
  deviceEnabled: (event: DeviceTypeInfo, client: ClientApi) => void;
  deviceDisabled: (event: DeviceTypeInfo, client: ClientApi) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (arg: any, client: ClientApi) => void;

  targetTrackEncodingRequested: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["targetTrackEncodingRequested"]>[0],
    client: ClientApi,
  ) => void;
  localTrackAdded: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackAdded"]>[0],
    client: ClientApi,
  ) => void;
  localTrackRemoved: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackRemoved"]>[0],
    client: ClientApi,
  ) => void;
  localTrackReplaced: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackReplaced"]>[0],
    client: ClientApi,
  ) => void;
  localTrackMuted: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackMuted"]>[0],
    client: ClientApi,
  ) => void;
  localTrackUnmuted: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackUnmuted"]>[0],
    client: ClientApi,
  ) => void;
  localTrackBandwidthSet: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackBandwidthSet"]>[0],
    client: ClientApi,
  ) => void;
  localTrackEncodingBandwidthSet: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackEncodingBandwidthSet"]>[0],
    client: ClientApi,
  ) => void;
  localTrackEncodingEnabled: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackEncodingEnabled"]>[0],
    client: ClientApi,
  ) => void;
  localTrackEncodingDisabled: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackEncodingDisabled"]>[0],
    client: ClientApi,
  ) => void;
  localPeerMetadataChanged: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localPeerMetadataChanged"]>[0],
    client: ClientApi,
  ) => void;
  localTrackMetadataChanged: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackMetadataChanged"]>[0],
    client: ClientApi,
  ) => void;
  disconnectRequested: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["disconnectRequested"]>[0],
    client: ClientApi,
  ) => void;
}

export type ReactClientCreateConfig = {
  clientConfig?: CreateConfig<PeerMetadata, TrackMetadata>;
  deviceManagerDefaultConfig?: DeviceManagerConfig;
};

export class Client extends (EventEmitter as new () => TypedEmitter<Required<ClientEvents>>) {
  private readonly tsClient: FishjamClient<PeerMetadata, TrackMetadata>;

  public local: PeerState | null = null;

  public peers: Record<PeerId, PeerState> = {};
  public components: Record<PeerId, PeerState> = {};

  public peersTracks: Record<TrackId, TrackWithOrigin> = {};
  public componentsTracks: Record<TrackId, TrackWithOrigin> = {};

  public bandwidthEstimation: bigint = BigInt(0);
  public status: PeerStatus = null;
  public media: MediaState | null = null;
  public devices: Devices;

  public reconnectionStatus: ReconnectionStatus = "idle";

  public videoDeviceManager: DeviceManager;
  public audioDeviceManager: DeviceManager;
  private initialized: boolean = false;

  constructor(config?: ReactClientCreateConfig) {
    super();

    this.tsClient = new FishjamClient<PeerMetadata, TrackMetadata>(config?.clientConfig);
    this.videoDeviceManager = new DeviceManager("video", config?.deviceManagerDefaultConfig);
    this.audioDeviceManager = new DeviceManager("audio", config?.deviceManagerDefaultConfig);

    this.devices = {
      camera: {
        status: null,
        stream: null,
        track: null,
        enabled: false,
        mediaStatus: null,
        deviceInfo: null,
        error: null,
        devices: null,
      },
      microphone: {
        status: null,
        stream: null,
        track: null,
        enabled: false,
        mediaStatus: null,
        deviceInfo: null,
        error: null,
        devices: null,
      },
    };

    this.stateToSnapshot();

    this.tsClient.on("disconnected", () => {
      this.status = null;
      this.stateToSnapshot();
      this.emit("disconnected", this);
    });

    this.tsClient.on("socketOpen", (event) => {
      this.status = "connected";
      this.stateToSnapshot();

      this.emit("socketOpen", event, this);
    });

    this.tsClient.on("socketError", (event) => {
      this.stateToSnapshot();

      this.emit("socketError", event, this);
    });

    this.tsClient.on("socketClose", (event) => {
      this.stateToSnapshot();

      this.emit("socketClose", event, this);
    });

    this.tsClient.on("authSuccess", () => {
      this.status = "authenticated";
      this.stateToSnapshot();

      this.emit("authSuccess", this);
    });

    this.tsClient.on("authError", (reason) => {
      this.stateToSnapshot();
      this.status = "error";

      this.emit("authError", reason, this);
    });

    this.tsClient.on("joined", (peerId, peers, components) => {
      this.status = "joined";
      this.stateToSnapshot();

      this.emit("joined", { peerId, peers, components }, this);
    });

    this.tsClient.on("joinError", (metadata) => {
      this.status = "error";
      this.stateToSnapshot();

      this.emit("joinError", metadata, this);
    });

    this.tsClient.on("reconnectionStarted", () => {
      this.reconnectionStatus = "reconnecting";
      this.stateToSnapshot();

      this.emit("reconnectionStarted", this);
    });

    this.tsClient.on("reconnected", () => {
      this.reconnectionStatus = "idle";
      this.stateToSnapshot();

      this.emit("reconnected", this);
    });

    this.tsClient.on("reconnectionRetriesLimitReached", () => {
      this.reconnectionStatus = "error";
      this.stateToSnapshot();

      this.emit("reconnectionRetriesLimitReached", this);
    });

    this.tsClient.on("connectionError", (metadata) => {
      this.status = "error";
      this.stateToSnapshot();

      this.emit("connectionError", metadata, this);
    });

    this.tsClient.on("peerJoined", (peer) => {
      this.stateToSnapshot();

      this.emit("peerJoined", peer, this);
    });
    this.tsClient.on("peerUpdated", (peer) => {
      this.stateToSnapshot();

      this.emit("peerUpdated", peer, this);
    });
    this.tsClient.on("peerLeft", (peer) => {
      this.stateToSnapshot();

      this.emit("peerLeft", peer, this);
    });

    this.tsClient.on("componentAdded", (component) => {
      this.stateToSnapshot();

      this.emit("componentAdded", component, this);
    });

    this.tsClient.on("componentUpdated", (component) => {
      this.stateToSnapshot();

      this.emit("componentUpdated", component, this);
    });

    this.tsClient.on("componentRemoved", (component) => {
      this.stateToSnapshot();

      this.emit("componentRemoved", component, this);
    });

    this.tsClient.on("trackReady", (ctx) => {
      this.stateToSnapshot();

      this.emit("trackReady", ctx, this);
    });
    this.tsClient.on("trackAdded", (ctx) => {
      this.stateToSnapshot();

      this.emit("trackAdded", ctx, this);

      ctx.on("encodingChanged", () => {
        this.stateToSnapshot();

        this.emit("encodingChanged", ctx, this);
      });
      ctx.on("voiceActivityChanged", () => {
        this.stateToSnapshot();

        this.emit("voiceActivityChanged", ctx, this);
      });
    });
    this.tsClient.on("trackRemoved", (ctx) => {
      this.stateToSnapshot();

      this.emit("trackRemoved", ctx, this);
      ctx.removeAllListeners();
    });
    this.tsClient.on("trackUpdated", (ctx) => {
      this.stateToSnapshot();

      this.emit("trackUpdated", ctx, this);
    });
    this.tsClient.on("bandwidthEstimationChanged", (estimation) => {
      this.stateToSnapshot();

      this.emit("bandwidthEstimationChanged", estimation, this);
    });

    this.videoDeviceManager.on("deviceDisabled", (state) => {
      this.stateToSnapshot();

      this.emit("deviceDisabled", { ...state, trackType: "video", mediaDeviceType: "userMedia" }, this);
    });

    this.videoDeviceManager.on("deviceEnabled", (state) => {
      this.stateToSnapshot();

      this.emit("deviceEnabled", { ...state, trackType: "video", mediaDeviceType: "userMedia" }, this);
    });

    this.videoDeviceManager.on("managerStarted", (state) => {
      this.stateToSnapshot();

      this.emit("managerStarted", { ...state, trackType: "video", mediaDeviceType: "userMedia" }, this);
    });

    this.videoDeviceManager.on("deviceStopped", (state) => {
      this.stateToSnapshot();

      this.emit("deviceStopped", { ...state, trackType: "video", mediaDeviceType: "userMedia" }, this);
    });

    this.videoDeviceManager.on("deviceReady", ({ stream }) => {
      this.stateToSnapshot();

      this.emit("deviceReady", { trackType: "video", stream, mediaDeviceType: "userMedia" }, this);
    });

    this.videoDeviceManager.on("devicesStarted", (event) => {
      this.stateToSnapshot();

      this.emit("devicesStarted", { ...event, trackType: "video", mediaDeviceType: "userMedia" }, this);
    });

    this.videoDeviceManager.on("devicesReady", (event) => {
      this.stateToSnapshot();

      this.emit("devicesReady", { ...event, trackType: "video", mediaDeviceType: "userMedia" }, this);
    });

    this.videoDeviceManager.on("error", (event) => {
      this.stateToSnapshot();

      this.emit("error", event, this);
    });

    this.audioDeviceManager.on("deviceDisabled", (state) => {
      this.stateToSnapshot();

      this.emit("deviceDisabled", { ...state, trackType: "audio", mediaDeviceType: "userMedia" }, this);
    });

    this.audioDeviceManager.on("deviceEnabled", (state) => {
      this.stateToSnapshot();

      this.emit("deviceEnabled", { ...state, trackType: "audio", mediaDeviceType: "userMedia" }, this);
    });

    this.audioDeviceManager.on("managerStarted", (state) => {
      this.stateToSnapshot();

      this.emit("managerStarted", { ...state, trackType: "audio", mediaDeviceType: "userMedia" }, this);
    });

    this.audioDeviceManager.on("deviceStopped", (state) => {
      this.stateToSnapshot();

      this.emit("deviceStopped", { ...state, trackType: "audio", mediaDeviceType: "userMedia" }, this);
    });

    this.audioDeviceManager.on("deviceReady", ({ stream }) => {
      this.stateToSnapshot();

      this.emit("deviceReady", { trackType: "audio", stream, mediaDeviceType: "userMedia" }, this);
    });

    this.audioDeviceManager.on("devicesStarted", (event) => {
      this.stateToSnapshot();

      this.emit("devicesStarted", { ...event, trackType: "audio", mediaDeviceType: "userMedia" }, this);
    });

    this.audioDeviceManager.on("devicesReady", (event) => {
      this.stateToSnapshot();

      this.emit("devicesReady", { ...event, trackType: "audio", mediaDeviceType: "userMedia" }, this);
    });

    this.audioDeviceManager.on("error", (event) => {
      this.stateToSnapshot();

      this.emit("error", event, this);
    });

    this.tsClient?.on("targetTrackEncodingRequested", (event) => {
      this.stateToSnapshot();

      this.emit("targetTrackEncodingRequested", event, this);
    });

    this.tsClient?.on("localTrackAdded", (event) => {
      this.stateToSnapshot();

      this.emit("localTrackAdded", event, this);
    });

    this.tsClient?.on("localTrackRemoved", (event) => {
      this.stateToSnapshot();

      this.emit("localTrackRemoved", event, this);
    });

    this.tsClient?.on("localTrackReplaced", (event) => {
      this.stateToSnapshot();

      this.emit("localTrackReplaced", event, this);
    });

    this.tsClient?.on("localTrackMuted", (event) => {
      this.stateToSnapshot();

      this.emit("localTrackMuted", event, this);
    });

    this.tsClient?.on("localTrackUnmuted", (event) => {
      this.stateToSnapshot();

      this.emit("localTrackUnmuted", event, this);
    });

    this.tsClient?.on("localTrackBandwidthSet", (event) => {
      this.stateToSnapshot();

      this.emit("localTrackBandwidthSet", event, this);
    });

    this.tsClient?.on("localTrackEncodingBandwidthSet", (event) => {
      this.stateToSnapshot();

      this.emit("localTrackEncodingBandwidthSet", event, this);
    });

    this.tsClient?.on("localTrackEncodingEnabled", (event) => {
      this.stateToSnapshot();

      this.emit("localTrackEncodingEnabled", event, this);
    });

    this.tsClient?.on("localTrackEncodingDisabled", (event) => {
      this.stateToSnapshot();

      this.emit("localTrackEncodingDisabled", event, this);
    });

    this.tsClient?.on("localPeerMetadataChanged", (event) => {
      this.stateToSnapshot();

      this.emit("localPeerMetadataChanged", event, this);
    });

    this.tsClient?.on("localTrackMetadataChanged", (event) => {
      this.stateToSnapshot();

      this.emit("localTrackMetadataChanged", event, this);
    });

    this.tsClient?.on("disconnectRequested", (event) => {
      this.stateToSnapshot();

      this.emit("disconnectRequested", event, this);
    });
  }

  public setDeviceManagerConfig(config: DeviceManagerConfig) {
    this.videoDeviceManager.setConfig(config.storage, config.trackConstraints);
    this.audioDeviceManager.setConfig(config.storage, config.trackConstraints);
  }

  private trackContextToTrack(track: TrackContext<PeerMetadata, TrackMetadata>): Track {
    return {
      rawMetadata: track.rawMetadata,
      metadata: track.metadata,
      trackId: track.trackId,
      stream: track.stream,
      simulcastConfig: track.simulcastConfig || null,
      encoding: track.encoding || null,
      vadStatus: track.vadStatus,
      track: track.track,
      metadataParsingError: track.metadataParsingError,
    };
  }

  public getTsClient = () => this.tsClient;

  public connect(config: ConnectConfig): void {
    this.status = "connecting";
    this.tsClient.connect({ ...config, peerMetadata: config?.peerMetadata ?? {} });
  }

  public disconnect() {
    this.status = null;
    this.tsClient.disconnect();
  }

  public addTrack(
    track: MediaStreamTrack,
    simulcastConfig: SimulcastConfig = { enabled: false, activeEncodings: [], disabledEncodings: [] },
    maxBandwidth: TrackBandwidthLimit = 0, // unlimited bandwidth
  ): Promise<string> {
    return this.tsClient.addTrack(track, undefined, simulcastConfig, maxBandwidth);
  }

  public removeTrack(trackId: string): Promise<void> {
    return this.tsClient.removeTrack(trackId);
  }

  public replaceTrack(trackId: string, newTrack: MediaStreamTrack | null): Promise<void> {
    return this.tsClient.replaceTrack(trackId, newTrack);
  }

  public getStatistics(selector?: MediaStreamTrack | null): Promise<RTCStatsReport> {
    return this.tsClient.getStatistics(selector);
  }

  public getBandwidthEstimation(): bigint {
    return this.tsClient.getBandwidthEstimation();
  }

  public setTrackBandwidth(trackId: string, bandwidth: BandwidthLimit): Promise<boolean> {
    return this.tsClient.setTrackBandwidth(trackId, bandwidth);
  }

  public setEncodingBandwidth(trackId: string, rid: string, bandwidth: BandwidthLimit): Promise<boolean> {
    return this.tsClient.setEncodingBandwidth(trackId, rid, bandwidth);
  }

  public setTargetTrackEncoding(trackId: string, encoding: Encoding): void {
    return this.tsClient.setTargetTrackEncoding(trackId, encoding);
  }

  public enableTrackEncoding(trackId: string, encoding: Encoding): Promise<void> {
    return this.tsClient.enableTrackEncoding(trackId, encoding);
  }

  public disableTrackEncoding(trackId: string, encoding: Encoding): Promise<void> {
    return this.tsClient.disableTrackEncoding(trackId, encoding);
  }

  public isReconnecting = (): boolean => {
    return this.tsClient.isReconnecting();
  };

  public initializeDevices = async (config?: DeviceManagerInitConfig) => {
    // This function should be called only once.
    // Any subsequent calls to this function will be ignored.
    if (this.initialized) return;
    this.initialized = true;

    const constraints = {
      video: this.videoDeviceManager.getConstraints(config?.videoTrackConstraints),
      audio: this.audioDeviceManager.getConstraints(config?.audioTrackConstraints),
    };

    const previousDevices = {
      video: this.videoDeviceManager.getLastDevice(),
      audio: this.audioDeviceManager.getLastDevice(),
    };

    let [stream, deviceErrors] = await getAvailableMedia(constraints);

    const devices = await navigator.mediaDevices.enumerateDevices();

    const videoDevices = devices.filter(({ kind }) => kind === "videoinput");
    const audioDevices = devices.filter(({ kind }) => kind === "audioinput");

    if (stream) {
      [stream, deviceErrors] = await getCorrectedResult(stream, deviceErrors, devices, constraints, previousDevices);
    }

    const state = {
      video: this.videoDeviceManager.initialize(
        stream,
        stream?.getVideoTracks()?.[0] ?? null,
        videoDevices,
        !!constraints.video,
        deviceErrors.video,
      ),
      audio: this.audioDeviceManager.initialize(
        stream,
        stream?.getAudioTracks()?.[0] ?? null,
        audioDevices,
        !!constraints.audio,
        deviceErrors.audio,
      ),
    };

    this.stateToSnapshot();
    this.emit("managerInitialized", state, this);
  };

  public startDevices = async (config: DeviceManagerStartConfig) => {
    this.videoDeviceManager.start(config?.videoDeviceId);
    this.audioDeviceManager.start(config?.audioDeviceId);
  };

  private stateToSnapshot() {
    const deviceManagerSnapshot = {
      audio: this?.audioDeviceManager?.deviceState,
      video: this?.videoDeviceManager?.deviceState,
    };

    const localEndpoint = this.tsClient.getLocalPeer();

    const localTracks: Record<TrackId, Track> = {};
    (localEndpoint?.tracks || new Map()).forEach((track) => {
      localTracks[track.trackId] = this.trackContextToTrack(track);
    });

    const devices: Devices = {
      camera: {
        status: deviceManagerSnapshot?.video?.devicesStatus || null,
        stream: deviceManagerSnapshot?.video.media?.stream || null,
        track: deviceManagerSnapshot?.video.media?.track || null,
        enabled: deviceManagerSnapshot?.video.media?.enabled || false,
        deviceInfo: deviceManagerSnapshot?.video.media?.deviceInfo || null,
        mediaStatus: deviceManagerSnapshot?.video.mediaStatus || null,
        error: deviceManagerSnapshot?.video?.error || null,
        devices: deviceManagerSnapshot?.video?.devices || null,
      },
      microphone: {
        status: deviceManagerSnapshot?.audio?.devicesStatus || null,
        stream: deviceManagerSnapshot?.audio.media?.stream || null,
        track: deviceManagerSnapshot?.audio.media?.track || null,
        enabled: deviceManagerSnapshot?.audio.media?.enabled || false,
        deviceInfo: deviceManagerSnapshot?.audio.media?.deviceInfo || null,
        mediaStatus: deviceManagerSnapshot?.video.mediaStatus || null,
        error: deviceManagerSnapshot?.audio?.error || null,
        devices: deviceManagerSnapshot?.audio?.devices || null,
      },
    };

    if (!this.tsClient["webrtc"]) {
      this.media = deviceManagerSnapshot || null;
      this.peersTracks = {};
      this.componentsTracks = {};
      this.devices = devices;
      this.peers = {};
      this.components = {};
      this.local = null;
      this.bandwidthEstimation = 0n;

      return;
    }

    const peers: Record<PeerId, PeerState> = {};
    const components: Record<PeerId, PeerState> = {};

    const peersTracks: Record<TrackId, TrackWithOrigin> = {};
    const componentTracks: Record<TrackId, TrackWithOrigin> = {};

    Object.values(this.tsClient.getRemotePeers()).forEach((remotePeer) => {
      const tracks: Record<TrackId, Track> = {};
      remotePeer.tracks.forEach((track) => {
        const mappedTrack = this.trackContextToTrack(track);
        tracks[track.trackId] = mappedTrack;
        peersTracks[track.trackId] = { ...mappedTrack, origin: remotePeer };
      });

      peers[remotePeer.id] = {
        rawMetadata: remotePeer.rawMetadata,
        metadata: remotePeer.metadata,
        metadataParsingError: remotePeer.metadataParsingError,
        id: remotePeer.id,
        tracks,
      };
    });

    Object.values(this.tsClient.getRemoteComponents()).forEach((remotePeer) => {
      const tracks: Record<TrackId, Track> = {};
      remotePeer.tracks.forEach((track) => {
        const mappedTrack = this.trackContextToTrack(track);
        tracks[track.trackId] = mappedTrack;
        componentTracks[track.trackId] = { ...mappedTrack, origin: remotePeer };
      });

      components[remotePeer.id] = {
        rawMetadata: remotePeer.rawMetadata,
        metadata: remotePeer.metadata,
        metadataParsingError: remotePeer.metadataParsingError,
        id: remotePeer.id,
        tracks,
      };
    });

    this.peersTracks = peersTracks;
    this.componentsTracks = componentTracks;
    this.media = deviceManagerSnapshot || null;
    this.local = localEndpoint
      ? {
          id: localEndpoint.id,
          metadata: localEndpoint.metadata,
          metadataParsingError: localEndpoint.metadataParsingError,
          rawMetadata: localEndpoint.rawMetadata,
          tracks: localTracks, // to record
        }
      : null;
    this.peers = peers;
    this.components = components;
    this.bandwidthEstimation = this.tsClient.getBandwidthEstimation();
    this.devices = devices;
  }
}
