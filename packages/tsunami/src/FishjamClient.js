import { FishjamClient as TsClient, getLogger, Variant } from "@fishjam-cloud/ts-client";
import { EventEmitter } from "events";
import { ClientResourceScope } from "./ClientResourceScope";
import { DeviceOrchestrator } from "./controllers/DeviceOrchestrator";
import { VIDEO_TRACK_CONSTRAINTS } from "./devices/constraints";
import { DeviceManagerMissingError } from "./errors/lifecycleErrors";
import { createInitialClientState } from "./state/clientState";
import { StateStore } from "./state/StateStore";
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
];
/**
 * Framework-agnostic Fishjam SDK client.
 *
 * Construction only allocates in-memory state. The signalling client and all
 * platform resources are created behind explicit operations. Once
 * {@link dispose} is called, the instance is terminal and must be replaced.
 * The code that creates an instance owns it and is responsible for disposing
 * it; sharing an instance does not transfer that ownership.
 */
export class FishjamClient extends EventEmitter {
  config;
  resources = new ClientResourceScope();
  tsClient = null;
  injectedTsClient = null;
  store = new StateStore(createInitialClientState());
  deviceOrchestrator = null;
  constructor(config) {
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
      this.deviceOrchestrator = new DeviceOrchestrator({
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
  get devices() {
    return this.deviceOrchestrator;
  }
  // --- device API (available when a deviceManager was injected) ---
  initializeDevices(settings) {
    return this.requireDevices().initializeDevices(settings);
  }
  async startCamera(deviceId) {
    await this.requireDevices().camera.start(deviceId);
  }
  async stopCamera() {
    await this.requireDevices().camera.stop();
  }
  async toggleCamera() {
    await this.requireDevices().camera.toggleDevice();
  }
  async selectCamera(deviceId) {
    await this.requireDevices().camera.selectDevice(deviceId);
  }
  async setCameraTrackMiddleware(middleware) {
    await this.requireDevices().camera.setTrackMiddleware(middleware);
  }
  async startMicrophone(deviceId) {
    await this.requireDevices().microphone.start(deviceId);
  }
  async stopMicrophone() {
    await this.requireDevices().microphone.stop();
  }
  async toggleMicrophone() {
    await this.requireDevices().microphone.toggleDevice();
  }
  async toggleMicrophoneMute() {
    await this.requireDevices().microphone.toggleMute();
  }
  async selectMicrophone(deviceId) {
    await this.requireDevices().microphone.selectDevice(deviceId);
  }
  async setMicrophoneTrackMiddleware(middleware) {
    await this.requireDevices().microphone.setTrackMiddleware(middleware);
  }
  startScreenShare(constraints) {
    return this.requireDevices().screenShare.start(constraints);
  }
  stopScreenShare() {
    return this.requireDevices().screenShare.stop();
  }
  setScreenShareTracksMiddleware(middleware) {
    return this.requireDevices().screenShare.setMiddleware(middleware);
  }
  setCustomSource(sourceId, stream) {
    return this.requireDevices().customSources.setSource(sourceId, stream);
  }
  requireDevices() {
    this.resources.assertActive();
    if (!this.deviceOrchestrator) throw new DeviceManagerMissingError();
    return this.deviceOrchestrator;
  }
  createTrackPublisher() {
    // The signalling layer is typed against DOM media types, while the device
    // layer only knows the platform contract. On React Native the runtime
    // objects reaching this boundary are react-native-webrtc tracks that the
    // signalling stack already handles, so the widening cast is confined here.
    const asSignallingTrack = (track) => track;
    return {
      addTrack: (track, metadata, simulcastConfig, maxBandwidth) =>
        this.addTrack(asSignallingTrack(track), metadata, simulcastConfig, maxBandwidth),
      replaceTrack: (trackId, newTrack) => this.replaceTrack(trackId, asSignallingTrack(newTrack)),
      removeTrack: (trackId) => this.removeTrack(trackId),
      updateTrackMetadata: (trackId, metadata) => this.updateTrackMetadata(trackId, metadata),
      getDisplayName: () => {
        const peerMetadata = this.getLocalPeer()?.metadata?.peer;
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
  getState = () => this.store.getState();
  /** Notifies on every state change; returns an unsubscribe function. */
  subscribe = (listener) => this.store.subscribe(listener);
  /** Notifies only when the selected part of the state changes (`Object.is`). */
  subscribeToSlice = (selector, listener) => this.store.subscribeToSlice(selector, listener);
  get isDisposed() {
    return this.resources.isDisposed;
  }
  /** Signalling initialization status retained for ts-client compatibility. */
  get status() {
    return this.tsClient?.status ?? "new";
  }
  emit(event, ...args) {
    if (this.tsClient) return this.tsClient.emit(event, ...args);
    return EventEmitter.prototype.emit.call(this, event, ...args);
  }
  async connect(config) {
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
  async getStatistics(selector) {
    return this.resources.run(() => this.tsClient?.getStatistics(selector) ?? Promise.resolve(new Map()));
  }
  getRemoteTracks() {
    return this.tsClient?.getRemoteTracks() ?? {};
  }
  getRemotePeers() {
    return this.tsClient?.getRemotePeers() ?? {};
  }
  getRemoteComponents() {
    return this.tsClient?.getRemoteComponents() ?? {};
  }
  getLocalPeer() {
    return this.tsClient?.getLocalPeer() ?? null;
  }
  getBandwidthEstimation() {
    this.resources.assertActive();
    if (!this.tsClient) throw new Error("WebRTC is not initialized");
    return this.tsClient.getBandwidthEstimation();
  }
  addTrack(track, trackMetadata, simulcastConfig, maxBandwidth) {
    return this.resources.run(() => this.getTsClient().addTrack(track, trackMetadata, simulcastConfig, maxBandwidth));
  }
  async replaceTrack(trackId, newTrack) {
    return this.resources.run(() => this.getTsClient().replaceTrack(trackId, newTrack));
  }
  async setTrackBandwidth(trackId, bandwidth) {
    return this.resources.run(() => this.getTsClient().setTrackBandwidth(trackId, bandwidth));
  }
  async setEncodingBandwidth(trackId, rid, bandwidth) {
    return this.resources.run(() => this.getTsClient().setEncodingBandwidth(trackId, rid, bandwidth));
  }
  removeTrack(trackId) {
    return this.resources.run(() => this.getTsClient().removeTrack(trackId));
  }
  setTargetTrackEncoding(trackId, encoding) {
    this.resources.assertActive();
    this.getTsClient().setTargetTrackEncoding(trackId, encoding);
  }
  enableTrackEncoding(trackId, encoding) {
    return this.resources.run(() => this.getTsClient().enableTrackEncoding(trackId, encoding));
  }
  disableTrackEncoding(trackId, encoding) {
    return this.resources.run(() => this.getTsClient().disableTrackEncoding(trackId, encoding));
  }
  updatePeerMetadata = (peerMetadata) => {
    this.resources.assertActive();
    this.getTsClient().updatePeerMetadata(peerMetadata);
  };
  updateTrackMetadata = (trackId, trackMetadata) => {
    this.resources.assertActive();
    this.getTsClient().updateTrackMetadata(trackId, trackMetadata);
  };
  isReconnecting() {
    return this.tsClient?.isReconnecting() ?? false;
  }
  getDataChannelsReadiness() {
    return this.tsClient?.getDataChannelsReadiness() ?? false;
  }
  leave = () => {
    this.resources.assertActive();
    this.getTsClient().leave();
  };
  createDataChannels() {
    return this.resources.run(() => this.getTsClient().createDataChannels());
  }
  publishData(data, options) {
    this.resources.assertActive();
    this.getTsClient().publishData(data, options);
  }
  subscribeData(callback, options) {
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
  async getLocalTrackAudioLevel(trackId) {
    return this.resources.run(() => this.tsClient?.getLocalTrackAudioLevel(trackId) ?? Promise.resolve(null));
  }
  /**
   * Releases every resource owned by this instance. This operation is
   * synchronous, idempotent, and terminal.
   */
  dispose() {
    if (this.resources.isDisposed) return;
    this.resources.dispose();
    this.deviceOrchestrator?.dispose();
    this.store.clear();
    const tsClient = this.tsClient;
    if (tsClient) {
      this.teardownTsClient(tsClient);
      this.tsClient = null;
    }
    super.removeAllListeners();
  }
  disconnect() {
    if (this.resources.isDisposed) return;
    this.tsClient?.disconnect();
  }
  cleanup() {
    if (this.resources.isDisposed) return;
    this.tsClient?.cleanup();
  }
  bindSessionStateEvents() {
    // Fresh references on every refresh: the signalling client mutates peers
    // in place, so re-read values must not be reference-equal to the previous
    // slice or the store would treat them as unchanged.
    const participants = () => {
      const localPeer = this.getLocalPeer();
      return {
        localPeer: localPeer === null ? null : { ...localPeer },
        remotePeers: { ...this.getRemotePeers() },
        components: { ...this.getRemoteComponents() },
      };
    };
    const reconnectionErrorIfReconnecting = () =>
      this.store.getState().reconnectionStatus === "reconnecting" ? { reconnectionStatus: "error" } : {};
    // Each event composes everything it affects into ONE update, so
    // subscribers observe exactly one notification per event.
    this.on("connectionStarted", () => this.store.update({ peerStatus: "connecting" }));
    this.on("joined", () => this.store.update({ peerStatus: "connected", ...participants() }));
    this.on("reconnected", () =>
      this.store.update({ peerStatus: "connected", reconnectionStatus: "idle", ...participants() }),
    );
    this.on("disconnected", () => this.store.update({ peerStatus: "idle", ...participants() }));
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
  getTsClient() {
    this.resources.assertActive();
    if (this.tsClient) return this.tsClient;
    const tsClient = this.injectedTsClient ?? new TsClient(this.config);
    const emitter = tsClient;
    const emit = emitter.emit.bind(emitter);
    emitter.emit = (event, ...args) => {
      const handledByTsClient = emit(event, ...args);
      const handledByTsunami = EventEmitter.prototype.emit.call(this, event, ...args);
      return handledByTsClient || handledByTsunami;
    };
    this.tsClient = tsClient;
    return tsClient;
  }
  teardownTsClient(tsClient) {
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
  stopLegacyBackgroundWork(tsClient) {
    // ts-client predates a holistic disposal API. Its cleanup() removes
    // listeners but does not cancel an already scheduled reconnect or expose
    // the statistics interval. Keep this compatibility bridge isolated here
    // until the strangler migration removes the legacy implementation.
    const internals = tsClient;
    try {
      internals.reconnectManager?.reset(undefined);
    } catch {
      // The remaining teardown is still required if legacy internals change.
    }
    if (internals.sendStatisticsInterval !== undefined) {
      clearInterval(internals.sendStatisticsInterval);
      internals.sendStatisticsInterval = undefined;
    }
  }
}
