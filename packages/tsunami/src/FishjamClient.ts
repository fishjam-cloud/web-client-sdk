import {
  type BandwidthLimit,
  type Component,
  type ConnectConfig,
  type CreateConfig,
  type DataCallback,
  type DataChannelOptions,
  FishjamClient as TsClient,
  type FishjamTrackContext,
  type GenericMetadata,
  getLogger,
  type MessageEvents,
  type Peer,
  type SimulcastConfig,
  type TrackBandwidthLimit,
  type TrackMetadata,
  Variant,
} from "@fishjam-cloud/ts-client";
import { EventEmitter } from "events";
import type TypedEmitter from "typed-emitter";

import { ClientResourceScope } from "./ClientResourceScope";
import { DeviceOrchestrator } from "./controllers/DeviceOrchestrator";
import type { ScreenShareConstraints } from "./controllers/ScreenShareController";
import type { TrackPublisher } from "./controllers/TrackPublisher";
import { VIDEO_TRACK_CONSTRAINTS } from "./devices/constraints";
import type { IDeviceManager, PlatformMediaStream, PlatformMediaStreamTrack } from "./devices/deviceManager";
import { DataChannelsNotConnectedError, DeviceManagerMissingError } from "./errors/lifecycleErrors";
import type {
  BandwidthLimits,
  InitializeDevicesResult,
  InitializeDevicesSettings,
  StreamConfig,
  TrackMiddleware,
  TracksMiddleware,
} from "./mediaTypes";
import { type ClientState, createInitialClientState } from "./state/clientState";
import { StateStore, type StoreListener } from "./state/StateStore";
import { VoiceActivityMonitor } from "./vad/VoiceActivityMonitor";

type LegacyClientInternals<PeerMetadata> = {
  reconnectManager?: { reset(metadata: PeerMetadata): void };
  sendStatisticsInterval?: ReturnType<typeof setInterval>;
};

export type FishjamClientConfig<PeerMetadata = GenericMetadata, ServerMetadata = GenericMetadata> = CreateConfig & {
  /**
   * Platform boundary for local media acquisition. When omitted (or `null`)
   * the client is signalling-only and all device-related state stays at its
   * zero values.
   */
  deviceManager?: IDeviceManager<PlatformMediaStream> | null;
  videoConstraints?: MediaTrackConstraints | boolean;
  audioConstraints?: MediaTrackConstraints | boolean;
  bandwidthLimits?: Partial<BandwidthLimits>;
  videoStreamConfig?: StreamConfig;
  audioStreamConfig?: StreamConfig;
  /**
   * Strangler-migration hook: use an externally created signalling client
   * instead of constructing one. Also the seam tests inject fakes through.
   *
   * @internal
   */
  signallingClient?: TsClient<PeerMetadata, ServerMetadata>;
};

/**
 * Events after which only the participant slices of {@link ClientState} are
 * re-read. Events that also change connection status (`joined`,
 * `disconnected`, `reconnected`) are handled separately so each event
 * produces a single state update.
 */
const participantEventNames = [
  "authSuccess",
  "trackReady",
  "trackAdded",
  "trackRemoved",
  "trackUpdated",
  "encodingChanged",
  "peerJoined",
  "peerLeft",
  "peerUpdated",
  "componentAdded",
  "componentRemoved",
  "componentUpdated",
  "localTrackAdded",
  "localTrackRemoved",
  "localTrackReplaced",
  "localTrackMuted",
  "localTrackUnmuted",
  "localTrackBandwidthSet",
  "localTrackEncodingBandwidthSet",
  "localTrackEncodingEnabled",
  "localTrackEncodingDisabled",
  "localPeerMetadataChanged",
  "localTrackMetadataChanged",
] as const;

/**
 * Framework-agnostic Fishjam SDK client.
 *
 * Construction only allocates in-memory state. The signalling client and all
 * platform resources are created behind explicit operations. Once
 * {@link dispose} is called, the instance is terminal and must be replaced.
 * The code that creates an instance owns it and is responsible for disposing
 * it; sharing an instance does not transfer that ownership.
 */
export class FishjamClient<PeerMetadata = GenericMetadata, ServerMetadata = GenericMetadata> extends (EventEmitter as {
  new <P, S>(): TypedEmitter<MessageEvents<P, S>>;
})<PeerMetadata, ServerMetadata> {
  private readonly config: CreateConfig | undefined;
  private readonly resources = new ClientResourceScope();

  private tsClient: TsClient<PeerMetadata, ServerMetadata> | null = null;
  private readonly injectedTsClient: TsClient<PeerMetadata, ServerMetadata> | null = null;

  private readonly store = new StateStore<ClientState<PeerMetadata, ServerMetadata>>(
    createInitialClientState<PeerMetadata, ServerMetadata>(),
  );

  private readonly deviceOrchestrator: DeviceOrchestrator<PeerMetadata, ServerMetadata> | null = null;

  public constructor(config?: FishjamClientConfig<PeerMetadata, ServerMetadata>) {
    super();
    const {
      deviceManager,
      videoConstraints,
      audioConstraints,
      bandwidthLimits,
      videoStreamConfig,
      audioStreamConfig,
      signallingClient,
      ...createConfig
    } = config ?? {};
    this.config = createConfig;
    this.injectedTsClient = signallingClient ?? null;

    this.bindSessionStateEvents();

    // An injected signalling client can emit events before any client method
    // is called, so its event forwarding must be wired immediately.
    if (signallingClient) this.getTsClient();

    if (deviceManager) {
      this.deviceOrchestrator = new DeviceOrchestrator<PeerMetadata, ServerMetadata>({
        publisher: this.createTrackPublisher(),
        deviceManager,
        store: this.store,
        logger: getLogger(config?.debug ?? false),
        videoConstraints: videoConstraints ?? VIDEO_TRACK_CONSTRAINTS,
        audioConstraints: audioConstraints ?? true,
        videoStreamConfig,
        audioStreamConfig,
        bandwidthLimits: {
          singleStream: bandwidthLimits?.singleStream ?? 0,
          simulcast: bandwidthLimits?.simulcast ?? {
            [Variant.VARIANT_LOW]: 0,
            [Variant.VARIANT_MEDIUM]: 0,
            [Variant.VARIANT_HIGH]: 0,
          },
        },
      });
    }
  }

  /**
   * Device controllers backing the high-level device API. Exposed for the
   * framework adapters during the strangler migration; application code
   * should use the `startCamera`-style methods instead.
   *
   * @internal
   */
  public get devices(): DeviceOrchestrator<PeerMetadata, ServerMetadata> | null {
    return this.deviceOrchestrator;
  }

  // --- device API (available when a deviceManager was injected) ---

  public initializeDevices(settings?: InitializeDevicesSettings): Promise<InitializeDevicesResult> {
    return this.requireDevices().initializeDevices(settings);
  }

  public async startCamera(deviceId?: string): Promise<void> {
    await this.requireDevices().camera.start(deviceId);
  }

  public async stopCamera(): Promise<void> {
    await this.requireDevices().camera.stop();
  }

  public async toggleCamera(): Promise<void> {
    await this.requireDevices().camera.toggleDevice();
  }

  public async selectCamera(deviceId: string): Promise<void> {
    await this.requireDevices().camera.selectDevice(deviceId);
  }

  public async setCameraTrackMiddleware(middleware: TrackMiddleware): Promise<void> {
    await this.requireDevices().camera.setTrackMiddleware(middleware);
  }

  public async startMicrophone(deviceId?: string): Promise<void> {
    await this.requireDevices().microphone.start(deviceId);
  }

  public async stopMicrophone(): Promise<void> {
    await this.requireDevices().microphone.stop();
  }

  public async toggleMicrophone(): Promise<void> {
    await this.requireDevices().microphone.toggleDevice();
  }

  public async toggleMicrophoneMute(): Promise<void> {
    await this.requireDevices().microphone.toggleMute();
  }

  public async selectMicrophone(deviceId: string): Promise<void> {
    await this.requireDevices().microphone.selectDevice(deviceId);
  }

  public async setMicrophoneTrackMiddleware(middleware: TrackMiddleware): Promise<void> {
    await this.requireDevices().microphone.setTrackMiddleware(middleware);
  }

  public startScreenShare(constraints?: ScreenShareConstraints): Promise<void> {
    return this.requireDevices().screenShare.start(constraints);
  }

  public stopScreenShare(): Promise<void> {
    return this.requireDevices().screenShare.stop();
  }

  public setScreenShareTracksMiddleware(middleware: TracksMiddleware | null): Promise<void> {
    return this.requireDevices().screenShare.setMiddleware(middleware);
  }

  public setCustomSource(sourceId: string, stream: PlatformMediaStream | null): Promise<void> {
    return this.requireDevices().customSources.setSource(sourceId, stream);
  }

  private requireDevices(): DeviceOrchestrator<PeerMetadata, ServerMetadata> {
    this.resources.assertActive();
    if (!this.deviceOrchestrator) throw new DeviceManagerMissingError();
    return this.deviceOrchestrator;
  }

  private createTrackPublisher(): TrackPublisher {
    // The signalling layer is typed against DOM media types, while the device
    // layer only knows the platform contract. On React Native the runtime
    // objects reaching this boundary are react-native-webrtc tracks that the
    // signalling stack already handles, so the widening cast is confined here.
    const asSignallingTrack = (track: PlatformMediaStreamTrack | null) => track as MediaStreamTrack | null;

    return {
      addTrack: (track, metadata, simulcastConfig, maxBandwidth) =>
        this.addTrack(asSignallingTrack(track) as MediaStreamTrack, metadata, simulcastConfig, maxBandwidth),
      replaceTrack: (trackId, newTrack) => this.replaceTrack(trackId, asSignallingTrack(newTrack)),
      removeTrack: (trackId) => this.removeTrack(trackId),
      updateTrackMetadata: (trackId, metadata) => this.updateTrackMetadata(trackId, metadata),
      getDisplayName: () => {
        const peerMetadata = this.getLocalPeer()?.metadata?.peer as Record<string, unknown> | undefined;
        const displayName = peerMetadata?.displayName;
        return typeof displayName === "string" ? displayName : undefined;
      },
      resolveRemoteTrackId: (remoteOrLocalTrackId) => {
        const tracks = this.getLocalPeer()?.tracks;
        if (!tracks) return null;
        if (tracks.get(remoteOrLocalTrackId)) return remoteOrLocalTrackId;
        const trackByLocalId = [...tracks.values()].find(({ track }) => track?.id === remoteOrLocalTrackId);
        return trackByLocalId?.trackId ?? null;
      },
      isSignallingActive: () => this.status === "initialized",
      onJoined: (listener) => {
        this.on("joined", listener);
        return () => this.off("joined", listener);
      },
      onDisconnected: (listener) => {
        this.on("disconnected", listener);
        return () => this.off("disconnected", listener);
      },
    };
  }

  /** Synchronously readable snapshot of the client's observable state. */
  public getState = (): ClientState<PeerMetadata, ServerMetadata> => this.store.getState();

  /** Notifies on every state change; returns an unsubscribe function. */
  public subscribe = (listener: StoreListener): (() => void) => this.store.subscribe(listener);

  private voiceActivityMonitor: VoiceActivityMonitor | null = null;

  /**
   * Voice activity keyed by peer id, for every peer with a published
   * microphone track. Stable reference until a value changes. High-frequency
   * channel — deliberately separate from {@link getState}.
   */
  public getVoiceActivity = (): Record<string, boolean> => this.requireVoiceActivityMonitor().getSnapshot();

  /** Notifies on any voice-activity change; returns an unsubscribe function. */
  public subscribeToVoiceActivity = (listener: () => void): (() => void) =>
    this.requireVoiceActivityMonitor().subscribe(listener);

  private requireVoiceActivityMonitor(): VoiceActivityMonitor {
    if (!this.voiceActivityMonitor) {
      this.voiceActivityMonitor = new VoiceActivityMonitor({
        getLocalPeer: () => this.getLocalPeer(),
        getRemotePeers: () => this.getRemotePeers(),
        getLocalTrackAudioLevel: (trackId) => this.getLocalTrackAudioLevel(trackId),
        subscribeToPeerChanges: this.subscribe,
      });
    }
    return this.voiceActivityMonitor;
  }

  /** Notifies only when the selected part of the state changes (`Object.is`). */
  public subscribeToSlice = <Slice>(
    selector: (state: ClientState<PeerMetadata, ServerMetadata>) => Slice,
    listener: (slice: Slice, previousSlice: Slice) => void,
  ): (() => void) => this.store.subscribeToSlice(selector, listener);

  public get isDisposed(): boolean {
    return this.resources.isDisposed;
  }

  /** Signalling initialization status retained for ts-client compatibility. */
  public get status(): TsClient<PeerMetadata, ServerMetadata>["status"] {
    return this.tsClient?.status ?? "new";
  }

  public override emit<Event extends keyof MessageEvents<PeerMetadata, ServerMetadata>>(
    event: Event,
    ...args: Parameters<MessageEvents<PeerMetadata, ServerMetadata>[Event]>
  ): boolean;
  public override emit(event: string | symbol, ...args: unknown[]): boolean {
    if (this.tsClient) return (this.tsClient as EventEmitter).emit(event, ...args);
    return EventEmitter.prototype.emit.call(this, event, ...args);
  }

  public async connect(config: ConnectConfig<PeerMetadata>): Promise<void> {
    return this.resources.run(() => {
      const tsClient = this.getTsClient();

      try {
        return tsClient.connect(config);
      } finally {
        // A synchronous connection event can dispose the wrapper before
        // ts-client finishes connect(). Tear it down again in case connect()
        // created resources after the first disposal pass.
        if (this.resources.isDisposed) this.teardownTsClient(tsClient);
      }
    });
  }

  public async getStatistics(selector?: MediaStreamTrack | null): Promise<RTCStatsReport> {
    return this.resources.run(() => this.tsClient?.getStatistics(selector) ?? Promise.resolve(new Map()));
  }

  public getRemoteTracks(): Readonly<Record<string, FishjamTrackContext>> {
    return this.tsClient?.getRemoteTracks() ?? {};
  }

  public getRemotePeers(): Record<string, Peer<PeerMetadata, ServerMetadata>> {
    return this.tsClient?.getRemotePeers() ?? {};
  }

  public getRemoteComponents(): Record<string, Component> {
    return this.tsClient?.getRemoteComponents() ?? {};
  }

  public getLocalPeer(): Peer<PeerMetadata, ServerMetadata> | null {
    return this.tsClient?.getLocalPeer() ?? null;
  }

  public getBandwidthEstimation(): bigint {
    this.resources.assertActive();
    if (!this.tsClient) throw new Error("WebRTC is not initialized");
    return this.tsClient.getBandwidthEstimation();
  }

  public addTrack(
    track: MediaStreamTrack,
    trackMetadata?: TrackMetadata,
    simulcastConfig?: SimulcastConfig,
    maxBandwidth?: TrackBandwidthLimit,
  ): Promise<string> {
    return this.resources.run(() => this.getTsClient().addTrack(track, trackMetadata, simulcastConfig, maxBandwidth));
  }

  public async replaceTrack(trackId: string, newTrack: MediaStreamTrack | null): Promise<void> {
    return this.resources.run(() => this.getTsClient().replaceTrack(trackId, newTrack));
  }

  public async setTrackBandwidth(trackId: string, bandwidth: BandwidthLimit): Promise<boolean> {
    return this.resources.run(() => this.getTsClient().setTrackBandwidth(trackId, bandwidth));
  }

  public async setEncodingBandwidth(trackId: string, rid: Variant, bandwidth: BandwidthLimit): Promise<boolean> {
    return this.resources.run(() => this.getTsClient().setEncodingBandwidth(trackId, rid, bandwidth));
  }

  public removeTrack(trackId: string): Promise<void> {
    return this.resources.run(() => this.getTsClient().removeTrack(trackId));
  }

  public setTargetTrackEncoding(trackId: string, encoding: Variant): void {
    this.resources.assertActive();
    this.getTsClient().setTargetTrackEncoding(trackId, encoding);
  }

  public enableTrackEncoding(trackId: string, encoding: Variant): Promise<void> {
    return this.resources.run(() => this.getTsClient().enableTrackEncoding(trackId, encoding));
  }

  public disableTrackEncoding(trackId: string, encoding: Variant): Promise<void> {
    return this.resources.run(() => this.getTsClient().disableTrackEncoding(trackId, encoding));
  }

  public updatePeerMetadata = (peerMetadata: PeerMetadata): void => {
    this.resources.assertActive();
    this.getTsClient().updatePeerMetadata(peerMetadata);
  };

  public updateTrackMetadata = (trackId: string, trackMetadata: TrackMetadata): void => {
    this.resources.assertActive();
    this.getTsClient().updateTrackMetadata(trackId, trackMetadata);
  };

  public isReconnecting(): boolean {
    return this.tsClient?.isReconnecting() ?? false;
  }

  public getDataChannelsReadiness(): boolean {
    return this.tsClient?.getDataChannelsReadiness() ?? false;
  }

  public leave = (): void => {
    this.resources.assertActive();
    this.getTsClient().leave();
  };

  public createDataChannels(): Promise<void> {
    return this.resources.run(async () => {
      const { dataChannel, peerStatus } = this.store.getState();
      if (dataChannel.status !== "idle") return;

      if (peerStatus !== "connected") {
        const error = new DataChannelsNotConnectedError();
        this.store.update({ dataChannel: { status: "idle", error } });
        throw error;
      }

      this.store.update({ dataChannel: { status: "creating", error: null } });
      try {
        await this.getTsClient().createDataChannels();
      } catch (error) {
        this.store.update({
          dataChannel: { status: "idle", error: error instanceof Error ? error : new Error(String(error)) },
        });
        throw error;
      }
    });
  }

  public publishData(data: Uint8Array, options: DataChannelOptions): void {
    this.resources.assertActive();
    try {
      this.getTsClient().publishData(data, options);
    } catch (error) {
      this.store.update({
        dataChannel: {
          ...this.store.getState().dataChannel,
          error: error instanceof Error ? error : new Error(String(error)),
        },
      });
      throw error;
    }
  }

  public subscribeData(callback: DataCallback, options: DataChannelOptions): () => void {
    this.resources.assertActive();

    const unsubscribe = this.getTsClient().subscribeData(callback, options);
    let subscribed = true;
    const cleanup = () => {
      if (!subscribed) return;
      subscribed = false;
      unsubscribe();
    };
    const unregisterCleanup = this.resources.registerCleanup(cleanup);

    return () => {
      unregisterCleanup();
      cleanup();
    };
  }

  public async getLocalTrackAudioLevel(trackId: string): Promise<{ level: number } | null> {
    return this.resources.run(() => this.tsClient?.getLocalTrackAudioLevel(trackId) ?? Promise.resolve(null));
  }

  /**
   * Releases every resource owned by this instance. This operation is
   * synchronous, idempotent, and terminal.
   */
  public dispose(): void {
    if (this.resources.isDisposed) return;

    this.resources.dispose();
    this.deviceOrchestrator?.dispose();
    this.voiceActivityMonitor?.dispose();
    this.store.clear();

    const tsClient = this.tsClient;
    if (tsClient) {
      this.teardownTsClient(tsClient);
      this.tsClient = null;
    }

    super.removeAllListeners();
  }

  public disconnect(): void {
    if (this.resources.isDisposed) return;
    this.tsClient?.disconnect();
  }

  public cleanup(): void {
    if (this.resources.isDisposed) return;
    this.tsClient?.cleanup();
  }

  private bindSessionStateEvents(): void {
    type StatePartial = Partial<ClientState<PeerMetadata, ServerMetadata>>;

    // Fresh references on every refresh: the signalling client mutates peers
    // in place, so re-read values must not be reference-equal to the previous
    // slice or the store would treat them as unchanged.
    const participants = (): StatePartial => {
      const localPeer = this.getLocalPeer();
      return {
        localPeer: localPeer === null ? null : { ...localPeer },
        remotePeers: { ...this.getRemotePeers() },
        components: { ...this.getRemoteComponents() },
      };
    };
    const reconnectionErrorIfReconnecting = (): StatePartial =>
      this.store.getState().reconnectionStatus === "reconnecting" ? { reconnectionStatus: "error" } : {};

    // Each event composes everything it affects into ONE update, so
    // subscribers observe exactly one notification per event.
    this.on("connectionStarted", () => this.store.update({ peerStatus: "connecting" }));
    this.on("joined", () => this.store.update({ peerStatus: "connected", ...participants() }));
    this.on("reconnected", () =>
      this.store.update({ peerStatus: "connected", reconnectionStatus: "idle", ...participants() }),
    );
    this.on("disconnected", () =>
      this.store.update({
        peerStatus: "idle",
        dataChannel: { status: "idle", error: this.store.getState().dataChannel.error },
        ...participants(),
      }),
    );
    this.on("dataChannelsReady", () => this.store.update({ dataChannel: { status: "ready", error: null } }));
    this.on("dataChannelsError", (error) => this.store.update({ dataChannel: { status: "idle", error } }));
    this.on("authError", () => this.store.update({ peerStatus: "error", ...reconnectionErrorIfReconnecting() }));
    this.on("joinError", () => this.store.update({ peerStatus: "error", ...reconnectionErrorIfReconnecting() }));
    this.on("connectionError", () => this.store.update({ peerStatus: "error" }));
    this.on("reconnectionStarted", () => this.store.update({ reconnectionStatus: "reconnecting" }));
    this.on("reconnectionRetriesLimitReached", () => this.store.update({ reconnectionStatus: "error" }));

    const refreshParticipants = () => this.store.update(participants());
    for (const eventName of participantEventNames) {
      this.on(eventName, refreshParticipants);
    }
  }

  private getTsClient(): TsClient<PeerMetadata, ServerMetadata> {
    this.resources.assertActive();
    if (this.tsClient) return this.tsClient;

    const tsClient = this.injectedTsClient ?? new TsClient<PeerMetadata, ServerMetadata>(this.config);
    const emitter = tsClient as EventEmitter;
    const emit = emitter.emit.bind(emitter);
    emitter.emit = (event: string | symbol, ...args: unknown[]) => {
      const handledByTsClient = emit(event, ...args);
      const handledByTsunami = EventEmitter.prototype.emit.call(this, event, ...args);
      return handledByTsClient || handledByTsunami;
    };

    this.tsClient = tsClient;
    return tsClient;
  }

  private teardownTsClient(tsClient: TsClient<PeerMetadata, ServerMetadata>): void {
    this.stopLegacyBackgroundWork(tsClient);

    try {
      tsClient.disconnect();
    } catch {
      // Continue: listener cleanup must happen even if the signalling client fails.
    }

    try {
      tsClient.cleanup();
    } catch {
      // Continue: all listeners still need to be dropped.
    }

    tsClient.removeAllListeners();
  }

  private stopLegacyBackgroundWork(tsClient: TsClient<PeerMetadata, ServerMetadata>): void {
    // ts-client predates a holistic disposal API. Its cleanup() removes
    // listeners but does not cancel an already scheduled reconnect or expose
    // the statistics interval. Keep this compatibility bridge isolated here
    // until the strangler migration removes the legacy implementation.
    const internals = tsClient as unknown as LegacyClientInternals<PeerMetadata>;

    try {
      internals.reconnectManager?.reset(undefined as PeerMetadata);
    } catch {
      // The remaining teardown is still required if legacy internals change.
    }

    if (internals.sendStatisticsInterval !== undefined) {
      clearInterval(internals.sendStatisticsInterval);
      internals.sendStatisticsInterval = undefined;
    }
  }
}
