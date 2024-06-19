import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import type {
  AuthErrorReason,
  BandwidthLimit,
  Component,
  ConnectConfig,
  CreateConfig,
  MessageEvents,
  Peer,
  SimulcastConfig,
  TrackBandwidthLimit,
  TrackContext,
  TrackEncoding,
} from "@fishjam-dev/ts-client";
import { FishjamClient } from "@fishjam-dev/ts-client";
import type { PeerId, PeerState, PeerStatus, Track, TrackId, TrackWithOrigin } from "./state.types";
import type { DeviceManagerEvents } from "./DeviceManager";
import { DeviceManager } from "./DeviceManager";
import type { MediaDeviceType, ScreenShareManagerConfig } from "./ScreenShareManager";
import { ScreenShareManager } from "./ScreenShareManager";
import type { DeviceManagerConfig, DeviceManagerInitConfig, Devices, DeviceState, MediaState } from "./types";

export type ClientApi<PeerMetadata, TrackMetadata> = {
  local: PeerState<PeerMetadata, TrackMetadata> | null;

  peers: Record<PeerId, PeerState<PeerMetadata, TrackMetadata>>;
  peersTracks: Record<TrackId, TrackWithOrigin<PeerMetadata, TrackMetadata>>;

  components: Record<PeerId, PeerState<PeerMetadata, TrackMetadata>>;
  componentsTracks: Record<TrackId, TrackWithOrigin<PeerMetadata, TrackMetadata>>;

  bandwidthEstimation: bigint;
  status: PeerStatus;
  media: MediaState | null;
  devices: Devices<TrackMetadata>;
  deviceManager: DeviceManager;
  screenShareManager: ScreenShareManager;
};

export interface ClientEvents<PeerMetadata, TrackMetadata> {
  /**
   * Emitted when the websocket connection is closed
   *
   * @param {CloseEvent} event - Close event object from the websocket
   */
  socketClose: (event: CloseEvent, client: ClientApi<PeerMetadata, TrackMetadata>) => void;

  /**
   * Emitted when occurs an error in the websocket connection
   *
   * @param {Event} event - Event object from the websocket
   */
  socketError: (event: Event, client: ClientApi<PeerMetadata, TrackMetadata>) => void;

  /**
   * Emitted when the websocket connection is opened
   *
   * @param {Event} event - Event object from the websocket
   */
  socketOpen: (event: Event, client: ClientApi<PeerMetadata, TrackMetadata>) => void;

  /** Emitted when authentication is successful */
  authSuccess: (client: ClientApi<PeerMetadata, TrackMetadata>) => void;

  /** Emitted when authentication fails */
  authError: (reason: AuthErrorReason, client: ClientApi<PeerMetadata, TrackMetadata>) => void;

  /** Emitted when the connection is closed */
  disconnected: (client: ClientApi<PeerMetadata, TrackMetadata>) => void;

  /**
   * Called when peer was accepted.
   */
  joined: (
    event: {
      peerId: string;
      peers: Peer<PeerMetadata, TrackMetadata>[];
      components: Component<PeerMetadata, TrackMetadata>[];
    },
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;

  /**
   * Called when peer was not accepted
   * @param metadata - Pass through for client application to communicate further actions to frontend
   */
  joinError: (metadata: any, client: ClientApi<PeerMetadata, TrackMetadata>) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

  /**
   * Called when data in a new track arrives.
   *
   * This callback is always called after {@link MessageEvents.trackAdded}.
   * It informs user that data related to the given track arrives and can be played or displayed.
   */
  trackReady: (ctx: TrackContext<PeerMetadata, TrackMetadata>, client: ClientApi<PeerMetadata, TrackMetadata>) => void;

  /**
   * Called each time the peer which was already in the room, adds new track. Fields track and stream will be set to null.
   * These fields will be set to non-null value in {@link MessageEvents.trackReady}
   */
  trackAdded: (ctx: TrackContext<PeerMetadata, TrackMetadata>, client: ClientApi<PeerMetadata, TrackMetadata>) => void;

  /**
   * Called when some track will no longer be sent.
   *
   * It will also be called before {@link MessageEvents.peerLeft} for each track of this peer.
   */
  trackRemoved: (
    ctx: TrackContext<PeerMetadata, TrackMetadata>,
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;

  /**
   * Called each time peer has its track metadata updated.
   */
  trackUpdated: (
    ctx: TrackContext<PeerMetadata, TrackMetadata>,
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;

  /**
   * Called each time new peer joins the room.
   */
  peerJoined: (peer: Peer<PeerMetadata, TrackMetadata>, client: ClientApi<PeerMetadata, TrackMetadata>) => void;

  /**
   * Called each time peer leaves the room.
   */
  peerLeft: (peer: Peer<PeerMetadata, TrackMetadata>, client: ClientApi<PeerMetadata, TrackMetadata>) => void;

  /**
   * Called each time peer has its metadata updated.
   */
  peerUpdated: (peer: Peer<PeerMetadata, TrackMetadata>, client: ClientApi<PeerMetadata, TrackMetadata>) => void;

  /**
   * Called each time new Component is added to the room.
   */
  componentAdded: (
    peer: Component<PeerMetadata, TrackMetadata>,
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;

  /**
   * Called each time Component is removed from the room.
   */
  componentRemoved: (
    peer: Component<PeerMetadata, TrackMetadata>,
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;

  /**
   * Called each time Component has its metadata updated.
   */
  componentUpdated: (
    peer: Component<PeerMetadata, TrackMetadata>,
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;

  /**
   * Called in case of errors related to multimedia session e.g. ICE connection.
   */
  connectionError: (message: string, client: ClientApi<PeerMetadata, TrackMetadata>) => void;

  /**
   * Called every time the server estimates client's bandiwdth.
   *
   * @param {bigint} estimation - client's available incoming bitrate estimated
   * by the server. It's measured in bits per second.
   */
  bandwidthEstimationChanged: (estimation: bigint, client: ClientApi<PeerMetadata, TrackMetadata>) => void;

  // track context events
  encodingChanged: (
    context: TrackContext<PeerMetadata, TrackMetadata>,
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;

  /**
   * Emitted every time an update about voice activity is received from the server.
   */
  voiceActivityChanged: (
    context: TrackContext<PeerMetadata, TrackMetadata>,
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;

  // device manager events
  managerStarted: (
    event: Parameters<DeviceManagerEvents["managerInitialized"]>[0] & {
      mediaDeviceType: MediaDeviceType;
    },
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  managerInitialized: (
    event: { audio?: DeviceState; video?: DeviceState; mediaDeviceType: MediaDeviceType },
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  deviceReady: (
    event: Parameters<DeviceManagerEvents["deviceReady"]>[0] & { mediaDeviceType: MediaDeviceType },
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  devicesStarted: (
    event: Parameters<DeviceManagerEvents["devicesStarted"]>[0] & { mediaDeviceType: MediaDeviceType },
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  devicesReady: (
    event: Parameters<DeviceManagerEvents["devicesReady"]>[0] & { mediaDeviceType: MediaDeviceType },
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  deviceStopped: (
    event: Parameters<DeviceManagerEvents["deviceStopped"]>[0] & { mediaDeviceType: MediaDeviceType },
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  deviceEnabled: (
    event: Parameters<DeviceManagerEvents["deviceEnabled"]>[0] & {
      mediaDeviceType: MediaDeviceType;
    },
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  deviceDisabled: (
    event: Parameters<DeviceManagerEvents["deviceDisabled"]>[0] & {
      mediaDeviceType: MediaDeviceType;
    },
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (arg: any, client: ClientApi<PeerMetadata, TrackMetadata>) => void;

  targetTrackEncodingRequested: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["targetTrackEncodingRequested"]>[0],
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  localTrackAdded: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackAdded"]>[0],
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  localTrackRemoved: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackRemoved"]>[0],
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  localTrackReplaced: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackReplaced"]>[0],
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  localTrackMuted: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackMuted"]>[0],
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  localTrackUnmuted: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackUnmuted"]>[0],
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  localTrackBandwidthSet: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackBandwidthSet"]>[0],
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  localTrackEncodingBandwidthSet: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackEncodingBandwidthSet"]>[0],
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  localTrackEncodingEnabled: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackEncodingEnabled"]>[0],
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  localTrackEncodingDisabled: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackEncodingDisabled"]>[0],
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  localEndpointMetadataChanged: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localEndpointMetadataChanged"]>[0],
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  localTrackMetadataChanged: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["localTrackMetadataChanged"]>[0],
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
  disconnectRequested: (
    event: Parameters<MessageEvents<PeerMetadata, TrackMetadata>["disconnectRequested"]>[0],
    client: ClientApi<PeerMetadata, TrackMetadata>,
  ) => void;
}

export type ReactClientCreteConfig<PeerMetadata, TrackMetadata> = {
  clientConfig?: CreateConfig<PeerMetadata, TrackMetadata>;
  deviceManagerDefaultConfig?: DeviceManagerConfig;
  screenShareManagerDefaultConfig?: ScreenShareManagerConfig;
};

const NOOP = () => {};

export class Client<PeerMetadata, TrackMetadata> extends (EventEmitter as {
  new <PeerMetadata, TrackMetadata>(): TypedEmitter<Required<ClientEvents<PeerMetadata, TrackMetadata>>>;
})<PeerMetadata, TrackMetadata> {
  private readonly tsClient: FishjamClient<PeerMetadata, TrackMetadata>;
  public readonly deviceManager: DeviceManager;
  public readonly screenShareManager: ScreenShareManager;

  public local: PeerState<PeerMetadata, TrackMetadata> | null = null;

  public peers: Record<PeerId, PeerState<PeerMetadata, TrackMetadata>> = {};
  public components: Record<PeerId, PeerState<PeerMetadata, TrackMetadata>> = {};

  public peersTracks: Record<TrackId, TrackWithOrigin<PeerMetadata, TrackMetadata>> = {};
  public componentsTracks: Record<TrackId, TrackWithOrigin<PeerMetadata, TrackMetadata>> = {};

  public bandwidthEstimation: bigint = BigInt(0);
  public status: PeerStatus = null;
  public media: MediaState | null = null;
  public devices: Devices<TrackMetadata>;

  private currentMicrophoneTrackId: string | null = null;
  private currentCameraTrackId: string | null = null;
  private currentScreenShareTrackId: string | null = null;

  constructor(config?: ReactClientCreteConfig<PeerMetadata, TrackMetadata>) {
    super();

    this.tsClient = new FishjamClient<PeerMetadata, TrackMetadata>(config?.clientConfig);
    this.deviceManager = new DeviceManager(config?.deviceManagerDefaultConfig);
    this.screenShareManager = new ScreenShareManager(config?.screenShareManagerDefaultConfig);

    this.devices = {
      init: NOOP,
      start: NOOP,
      camera: {
        stop: NOOP,
        setEnable: NOOP,
        start: NOOP,
        addTrack: (
          _trackMetadata?: TrackMetadata,
          _simulcastConfig?: SimulcastConfig,
          _maxBandwidth?: TrackBandwidthLimit,
        ) => Promise.reject(),
        removeTrack: () => Promise.reject(),
        replaceTrack: (_newTrackMetadata?: TrackMetadata) => Promise.reject(),
        muteTrack: (_newTrackMetadata?: TrackMetadata) => Promise.reject(),
        unmuteTrack: (_newTrackMetadata?: TrackMetadata) => Promise.reject(),
        updateTrackMetadata: NOOP,
        broadcast: null,
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
        stop: NOOP,
        setEnable: NOOP,
        start: NOOP,
        addTrack: (_trackMetadata?: TrackMetadata, _maxBandwidth?: TrackBandwidthLimit) => Promise.reject(),
        removeTrack: () => Promise.reject(),
        replaceTrack: (_newTrackMetadata?: TrackMetadata) => Promise.reject(),
        muteTrack: (_newTrackMetadata?: TrackMetadata) => Promise.reject(),
        unmuteTrack: (_newTrackMetadata?: TrackMetadata) => Promise.reject(),
        updateTrackMetadata: NOOP,
        broadcast: null,
        status: null,
        stream: null,
        track: null,
        enabled: false,
        mediaStatus: null,
        deviceInfo: null,
        error: null,
        devices: null,
      },
      screenShare: {
        stop: NOOP,
        setEnable: NOOP,
        start: NOOP,
        addTrack: (_trackMetadata?: TrackMetadata, _maxBandwidth?: TrackBandwidthLimit) => Promise.reject(),
        removeTrack: () => Promise.reject(),
        broadcast: null,
        status: null,
        stream: null,
        track: null,
        enabled: false,
        mediaStatus: null,
        error: null,
      },
    };

    this.stateToSnapshot();

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

    this.tsClient.on("disconnected", () => {
      this.status = null;
      this.stateToSnapshot();

      this.emit("disconnected", this);
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

    this.deviceManager.on("deviceDisabled", (event) => {
      this.stateToSnapshot();

      this.emit("deviceDisabled", { ...event, mediaDeviceType: "userMedia" }, this);
    });

    this.deviceManager.on("deviceEnabled", (event) => {
      this.stateToSnapshot();

      this.emit("deviceEnabled", { ...event, mediaDeviceType: "userMedia" }, this);
    });

    this.deviceManager.on("managerInitialized", (event) => {
      this.stateToSnapshot();

      this.emit("managerInitialized", { ...event, mediaDeviceType: "userMedia" }, this);
    });

    this.deviceManager.on("managerStarted", (event) => {
      this.stateToSnapshot();

      this.emit("managerStarted", { ...event, mediaDeviceType: "userMedia" }, this);
    });

    this.deviceManager.on("deviceStopped", (event) => {
      this.stateToSnapshot();

      this.emit("deviceStopped", { trackType: event.trackType, mediaDeviceType: "userMedia" }, this);
    });

    this.deviceManager.on("deviceReady", (event) => {
      this.stateToSnapshot();

      this.emit("deviceReady", { ...event, mediaDeviceType: "userMedia" }, this);
    });

    this.deviceManager.on("devicesStarted", (event) => {
      this.stateToSnapshot();

      this.emit("devicesStarted", { ...event, mediaDeviceType: "userMedia" }, this);
    });

    this.deviceManager.on("devicesReady", (event) => {
      this.stateToSnapshot();

      this.emit("devicesReady", { ...event, mediaDeviceType: "userMedia" }, this);
    });

    this.deviceManager.on("error", (event) => {
      this.stateToSnapshot();

      this.emit("error", event, this);
    });

    this.screenShareManager.on("deviceDisabled", (event) => {
      this.stateToSnapshot();

      this.emit("deviceDisabled", { trackType: event.type, mediaDeviceType: "displayMedia" }, this);
    });

    this.screenShareManager.on("deviceEnabled", (event) => {
      this.stateToSnapshot();

      this.emit("deviceEnabled", { trackType: event.type, mediaDeviceType: "displayMedia" }, this);
    });

    this.screenShareManager.on("deviceStopped", async (event) => {
      this.stateToSnapshot();

      this.emit("deviceStopped", { trackType: event.type, mediaDeviceType: "displayMedia" }, this);
    });

    this.screenShareManager.on("deviceReady", (event, state) => {
      this.stateToSnapshot();

      if (!state.videoMedia?.stream) throw Error("Invalid screen share state");

      this.emit(
        "deviceReady",
        {
          trackType: event.type,
          stream: state.videoMedia.stream,
          mediaDeviceType: "displayMedia",
        },
        this,
      );
    });

    this.screenShareManager.on("error", (a) => {
      this.stateToSnapshot();

      this.emit("error", a, this);
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

    this.tsClient?.on("localEndpointMetadataChanged", (event) => {
      this.stateToSnapshot();

      this.emit("localEndpointMetadataChanged", event, this);
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

  public setScreenManagerConfig(config: ScreenShareManagerConfig) {
    this.screenShareManager?.setConfig(config);
  }

  public setDeviceManagerConfig(config: DeviceManagerConfig) {
    this.deviceManager?.setConfig(config);
  }

  private trackContextToTrack(track: TrackContext<PeerMetadata, TrackMetadata>): Track<TrackMetadata> {
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

  public connect(config: ConnectConfig<PeerMetadata>): void {
    this.status = "connecting";
    this.tsClient.connect(config);
  }

  public disconnect() {
    this.status = null;
    this.tsClient.disconnect();
  }

  public addTrack(
    track: MediaStreamTrack,
    trackMetadata?: TrackMetadata,
    simulcastConfig: SimulcastConfig = { enabled: false, activeEncodings: [], disabledEncodings: [] },
    maxBandwidth: TrackBandwidthLimit = 0, // unlimited bandwidth
  ): Promise<string> {
    if (!this.tsClient) throw Error("Client not initialized");

    return this.tsClient.addTrack(track, trackMetadata, simulcastConfig, maxBandwidth);
  }

  public removeTrack(trackId: string): Promise<void> {
    return this.tsClient.removeTrack(trackId);
  }

  public replaceTrack(
    trackId: string,
    newTrack: MediaStreamTrack | null,
    newTrackMetadata?: TrackMetadata,
  ): Promise<void> {
    return this.tsClient.replaceTrack(trackId, newTrack, newTrackMetadata);
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

  public setTargetTrackEncoding(trackId: string, encoding: TrackEncoding) {
    return this.tsClient.setTargetTrackEncoding(trackId, encoding);
  }

  public enableTrackEncoding(trackId: string, encoding: TrackEncoding) {
    return this.tsClient.enableTrackEncoding(trackId, encoding);
  }

  public disableTrackEncoding(trackId: string, encoding: TrackEncoding) {
    return this.tsClient.disableTrackEncoding(trackId, encoding);
  }

  public updatePeerMetadata = (peerMetadata: PeerMetadata): void => {
    this.tsClient.updatePeerMetadata(peerMetadata);
  };

  public updateTrackMetadata = (trackId: string, trackMetadata: TrackMetadata): void => {
    this.tsClient.updateTrackMetadata(trackId, trackMetadata);
  };

  // In most cases, the track is identified by its remote track ID.
  // This ID comes from the ts-client `addTrack` method.
  // However, we don't have that ID before the `addTrack` method returns it.
  //
  // The `addTrack` method emits the `localTrackAdded` event.
  // This event will refresh the internal state of this object.
  // However, in that event handler, we don't yet have the remote track ID.
  // Therefore, for that brief moment, we will use the local track ID from the MediaStreamTrack object to identify the track.
  private getRemoteTrack = (remoteOrLocalTrackId: string | null): Track<TrackMetadata> | null => {
    if (!remoteOrLocalTrackId) return null;

    const tracks = this.tsClient?.getLocalEndpoint()?.tracks;
    if (!tracks) return null;

    const trackByRemoteId = tracks?.get(remoteOrLocalTrackId);
    if (trackByRemoteId) return this.trackContextToTrack(trackByRemoteId);

    const trackByLocalId = [...tracks.values()].find((track) => track.track?.id === remoteOrLocalTrackId);
    return trackByLocalId ? this.trackContextToTrack(trackByLocalId) : null;
  };

  private stateToSnapshot() {
    if (!this.deviceManager) Error("Device manager is null");

    const screenShareManager = this.screenShareManager?.getSnapshot();
    const deviceManagerSnapshot = {
      audio: this?.deviceManager?.audio,
      video: this?.deviceManager?.video,
    };

    const localEndpoint = this.tsClient.getLocalEndpoint();

    const localTracks: Record<TrackId, Track<TrackMetadata>> = {};
    (localEndpoint?.tracks || new Map()).forEach((track) => {
      localTracks[track.trackId] = this.trackContextToTrack(track);
    });

    const broadcastedVideoTrack = this.getRemoteTrack(this.currentCameraTrackId);
    const broadcastedAudioTrack = this.getRemoteTrack(this.currentMicrophoneTrackId);
    const screenShareVideoTrack = this.getRemoteTrack(this.currentScreenShareTrackId);

    const devices: Devices<TrackMetadata> = {
      init: (config?: DeviceManagerInitConfig) => {
        this?.deviceManager?.init(config);
      },
      start: (config) => this?.deviceManager?.start(config),
      camera: {
        stop: () => {
          this?.deviceManager?.stop("video");
        },
        setEnable: (value: boolean) => this?.deviceManager?.setEnable("video", value),
        start: (deviceId?: string) => {
          this?.deviceManager?.start({ videoDeviceId: deviceId ?? true });
        },
        addTrack: async (
          trackMetadata?: TrackMetadata,
          simulcastConfig?: SimulcastConfig,
          maxBandwidth?: TrackBandwidthLimit,
        ) => {
          if (this.currentCameraTrackId) throw Error("Track already added");

          const media = this.deviceManager?.video.media;

          if (!media || !media.stream || !media.track) throw Error("Device is unavailable");

          // see `getRemoteTrack()` explanation
          this.currentCameraTrackId = media.track.id;

          const remoteTrackId = await this.tsClient.addTrack(media.track, trackMetadata, simulcastConfig, maxBandwidth);

          this.currentCameraTrackId = remoteTrackId;

          return remoteTrackId;
        },
        removeTrack: () => {
          if (!this.currentCameraTrackId) throw Error("There is no video track id");

          const prevTrack = this.getRemoteTrack(this.currentCameraTrackId);

          if (!prevTrack) throw Error("There is no video track");

          this.currentCameraTrackId = null;

          return this.tsClient.removeTrack(prevTrack.trackId);
        },
        replaceTrack: async (newTrackMetadata?: TrackMetadata) => {
          if (!this.currentCameraTrackId) throw Error("There is no  track id");

          const prevTrack = this.getRemoteTrack(this.currentCameraTrackId);

          if (!prevTrack) throw Error("There is no video track");

          const track = this.devices.camera.stream?.getVideoTracks()[0];

          if (!track) throw Error("New track is empty");

          await this.tsClient.replaceTrack(prevTrack.trackId, track, newTrackMetadata);
        },
        muteTrack: async (newTrackMetadata?: TrackMetadata) => {
          if (!this.currentCameraTrackId) throw Error("There is no video track id");

          const prevTrack = this.getRemoteTrack(this.currentCameraTrackId);

          if (!prevTrack) throw Error("There is no video track");

          await this.tsClient.replaceTrack(prevTrack.trackId, null, newTrackMetadata);
        },
        unmuteTrack: async (newTrackMetadata?: TrackMetadata) => {
          if (!this.currentCameraTrackId) throw Error("There is no video track id");

          const prevTrack = this.getRemoteTrack(this.currentCameraTrackId);

          if (!prevTrack) throw Error("There is no video track");

          const media = this.deviceManager?.video.media;

          if (!media || !media.stream || !media.track) throw Error("Device is unavailable");

          await this.tsClient.replaceTrack(prevTrack.trackId, media.track, newTrackMetadata);
        },
        updateTrackMetadata: (newTrackMetadata: TrackMetadata) => {
          if (!this.currentCameraTrackId) throw Error("There is no video track id");

          const prevTrack = this.getRemoteTrack(this.currentCameraTrackId);

          if (!prevTrack) throw Error("There is no video track");

          this.tsClient.updateTrackMetadata(this.currentCameraTrackId, newTrackMetadata);
        },
        broadcast: broadcastedVideoTrack ?? null,
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
        stop: () => this?.deviceManager?.stop("audio"),
        setEnable: (value: boolean) => this?.deviceManager?.setEnable("audio", value),
        start: (deviceId?: string) => {
          this?.deviceManager?.start({ audioDeviceId: deviceId ?? true });
        },
        addTrack: async (trackMetadata?: TrackMetadata, maxBandwidth?: TrackBandwidthLimit) => {
          const media = this.deviceManager?.audio.media;

          if (!media || !media.stream || !media.track) throw Error("Device is unavailable");

          if (this.currentMicrophoneTrackId) throw Error("Track already added");

          // see `getRemoteTrack()` explanation
          this.currentMicrophoneTrackId = media.track.id;

          const remoteTrackId = await this.tsClient.addTrack(media.track, trackMetadata, undefined, maxBandwidth);

          this.currentMicrophoneTrackId = remoteTrackId;

          return remoteTrackId;
        },
        removeTrack: () => {
          if (!this.currentMicrophoneTrackId) throw Error("There is no audio track id");

          const prevTrack = this.getRemoteTrack(this.currentMicrophoneTrackId);

          if (!prevTrack) throw Error("There is no audio track");

          this.currentMicrophoneTrackId = null;

          return this.tsClient.removeTrack(prevTrack.trackId);
        },
        replaceTrack: async (newTrackMetadata?: TrackMetadata) => {
          if (!this.currentMicrophoneTrackId) throw Error("There is no audio track id");

          const prevTrack = this.getRemoteTrack(this.currentMicrophoneTrackId);

          if (!prevTrack) throw Error("There is no audio track");

          const track = this.devices.microphone.stream?.getAudioTracks()[0];

          if (!track) throw Error("New track is empty");

          await this.tsClient.replaceTrack(prevTrack.trackId, track, newTrackMetadata);
        },
        muteTrack: async (newTrackMetadata?: TrackMetadata) => {
          if (!this.currentMicrophoneTrackId) throw Error("There is no audio track id");

          const prevTrack = this.getRemoteTrack(this.currentMicrophoneTrackId);

          if (!prevTrack) throw Error("There is no audio track");

          await this.tsClient.replaceTrack(prevTrack.trackId, null, newTrackMetadata);
        },
        unmuteTrack: async (newTrackMetadata?: TrackMetadata) => {
          if (!this.currentMicrophoneTrackId) throw Error("There is no audio track id");

          const prevTrack = this.getRemoteTrack(this.currentMicrophoneTrackId);

          if (!prevTrack) throw Error("There is no audio track");

          const media = this.deviceManager?.audio.media;

          if (!media || !media.stream || !media.track) throw Error("Device is unavailable");

          await this.tsClient.replaceTrack(prevTrack.trackId, media.track, newTrackMetadata);
        },
        updateTrackMetadata: (newTrackMetadata: TrackMetadata) => {
          if (!this.currentMicrophoneTrackId) throw Error("There is no audio track id");

          const prevTrack = this.getRemoteTrack(this.currentMicrophoneTrackId);

          if (!prevTrack) throw Error("There is no audio track");

          this.tsClient.updateTrackMetadata(this.currentMicrophoneTrackId, newTrackMetadata);
        },
        broadcast: broadcastedAudioTrack ?? null,
        status: deviceManagerSnapshot?.audio?.devicesStatus || null,
        stream: deviceManagerSnapshot?.audio.media?.stream || null,
        track: deviceManagerSnapshot?.audio.media?.track || null,
        enabled: deviceManagerSnapshot?.audio.media?.enabled || false,
        deviceInfo: deviceManagerSnapshot?.audio.media?.deviceInfo || null,
        mediaStatus: deviceManagerSnapshot?.video.mediaStatus || null,
        error: deviceManagerSnapshot?.audio?.error || null,
        devices: deviceManagerSnapshot?.audio?.devices || null,
      },
      screenShare: {
        stop: () => {
          this?.screenShareManager?.stop("video");
        },
        setEnable: (value: boolean) => this.screenShareManager?.setEnable("video", value),
        start: (config?: ScreenShareManagerConfig) => {
          this.screenShareManager?.start(config);
        },
        addTrack: async (trackMetadata?: TrackMetadata, maxBandwidth?: TrackBandwidthLimit) => {
          const media = this.screenShareManager?.getSnapshot().videoMedia;

          if (!media || !media.stream || !media.track) throw Error("Device is unavailable");

          if (this.currentScreenShareTrackId) throw Error("Screen share track already added");

          // see `getRemoteTrack()` explanation
          this.currentScreenShareTrackId = media.track.id;

          const trackId = await this.tsClient.addTrack(media.track, trackMetadata, undefined, maxBandwidth);

          this.currentScreenShareTrackId = trackId;

          return trackId;
        },
        removeTrack: () => {
          if (!this.currentScreenShareTrackId) throw Error("There is no screen share track id");

          const prevTrack = this.getRemoteTrack(this.currentScreenShareTrackId);

          if (!prevTrack) throw Error("There is no screen share video track");

          this.currentScreenShareTrackId = null;

          return this.tsClient.removeTrack(prevTrack.trackId);
        },
        broadcast: screenShareVideoTrack ?? null,
        status: screenShareManager?.status || null,
        mediaStatus: null,
        stream: screenShareManager?.videoMedia?.stream || null,
        track: screenShareManager?.videoMedia?.track || null,
        enabled: screenShareManager?.videoMedia?.enabled || false,
        error: screenShareManager?.error || null,
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

    const peers: Record<PeerId, PeerState<PeerMetadata, TrackMetadata>> = {};
    const components: Record<PeerId, PeerState<PeerMetadata, TrackMetadata>> = {};

    const peersTracks: Record<TrackId, TrackWithOrigin<PeerMetadata, TrackMetadata>> = {};
    const componentTracks: Record<TrackId, TrackWithOrigin<PeerMetadata, TrackMetadata>> = {};

    Object.values(this.tsClient.getRemotePeers()).forEach((endpoint) => {
      const tracks: Record<TrackId, Track<TrackMetadata>> = {};
      endpoint.tracks.forEach((track) => {
        const mappedTrack = this.trackContextToTrack(track);
        tracks[track.trackId] = mappedTrack;
        peersTracks[track.trackId] = { ...mappedTrack, origin: endpoint };
      });

      peers[endpoint.id] = {
        rawMetadata: endpoint.rawMetadata,
        metadata: endpoint.metadata,
        metadataParsingError: endpoint.metadataParsingError,
        id: endpoint.id,
        tracks,
      };
    });

    Object.values(this.tsClient.getRemoteComponents()).forEach((endpoint) => {
      const tracks: Record<TrackId, Track<TrackMetadata>> = {};
      endpoint.tracks.forEach((track) => {
        const mappedTrack = this.trackContextToTrack(track);
        tracks[track.trackId] = mappedTrack;
        componentTracks[track.trackId] = { ...mappedTrack, origin: endpoint };
      });

      components[endpoint.id] = {
        rawMetadata: endpoint.rawMetadata,
        metadata: endpoint.metadata,
        metadataParsingError: endpoint.metadataParsingError,
        id: endpoint.id,
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
