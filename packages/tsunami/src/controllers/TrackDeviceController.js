import { TrackTypeError, Variant } from "@fishjam-cloud/ts-client";
import { DeviceError, UnknownDeviceError } from "../devices/errors";
import { getConfigAndBandwidthFromProps, getTrackFromStream, stopStream } from "../tracks/trackUtils";
const DEFAULT_SENT_QUALITIES = [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH];
/**
 * Owns the full lifecycle of one local media device (camera or microphone):
 * acquisition, soft mute, middleware, device switching, and publishing the
 * resulting track to the room.
 */
export class TrackDeviceController {
  deps;
  error = null;
  stream = null;
  processedTrack = null;
  middleware = null;
  middlewareCleanup = null;
  isEnabled = true;
  selectedDevice = null;
  currentTrackId = null;
  connectionPromise = null;
  trackEndCleanup = null;
  sessionCleanups;
  lastSnapshot = null;
  constructor(deps) {
    this.deps = deps;
    this.sessionCleanups = [
      deps.publisher.onJoined(() => this.handleJoined()),
      deps.publisher.onDisconnected(() => this.handleDisconnected()),
    ];
  }
  get rawTrack() {
    return this.stream && getTrackFromStream(this.stream, this.deps.type);
  }
  get deviceTrack() {
    return this.processedTrack ?? this.rawTrack;
  }
  snapshot() {
    const rawDeviceId = this.rawTrack?.getSettings().deviceId;
    const next = {
      track: this.deviceTrack,
      stream: this.stream,
      isEnabled: this.isEnabled,
      activeDevice: (rawDeviceId && this.deps.getAvailableDevices().find((d) => d.deviceId === rawDeviceId)) || null,
      selectedDevice: this.selectedDevice,
      middleware: this.middleware,
    };
    const previous = this.lastSnapshot;
    const isUnchanged =
      previous &&
      previous.track === next.track &&
      previous.stream === next.stream &&
      previous.isEnabled === next.isEnabled &&
      previous.activeDevice === next.activeDevice &&
      previous.selectedDevice === next.selectedDevice &&
      previous.middleware === next.middleware;
    if (isUnchanged) return previous;
    this.lastSnapshot = next;
    return next;
  }
  /** Adopts the stream produced by `initializeDevices` without invalidating it. */
  adoptInitialStream(stream) {
    if (!stream || this.stream) return;
    this.setStream(stream);
    this.notify();
  }
  setSelectedDevice(device) {
    this.selectedDevice = device;
    this.deps.onSelectedDeviceChanged(device);
    this.notify();
  }
  setError(error) {
    this.error = error;
    this.notify();
  }
  async startDevice(deviceId = this.selectedDevice?.deviceId) {
    const initialStream = await this.deps.getInitialStream();
    const initialTrack = initialStream && getTrackFromStream(initialStream, this.deps.type);
    const isUsingDesiredDevice = !deviceId || deviceId === initialTrack?.getSettings().deviceId;
    if (initialTrack?.enabled && isUsingDesiredDevice) {
      if (!this.stream) {
        this.setStream(initialStream);
        this.notify();
      }
      return [initialTrack, null];
    }
    try {
      const baseConstraints = typeof this.deps.constraints === "object" ? { ...this.deps.constraints } : {};
      if (deviceId) baseConstraints.deviceId = { exact: deviceId };
      const stream = await this.deps.deviceManager.getUserMedia({ [this.deps.type]: baseConstraints });
      if (this.stream) stopStream(this.stream, this.deps.type);
      this.deps.invalidateInitialStream();
      this.setStream(stream);
      const retrievedTrack = getTrackFromStream(stream, this.deps.type);
      if (!retrievedTrack) throw new Error(`getUserMedia returned no ${this.deps.type} track`);
      const retrievedDeviceId = retrievedTrack.getSettings().deviceId;
      if (retrievedDeviceId) {
        const device = this.deps.getAvailableDevices().find((d) => d.deviceId === retrievedDeviceId);
        if (device) this.setSelectedDevice(device);
      }
      if (!this.isEnabled) retrievedTrack.enabled = false;
      this.notify();
      return [retrievedTrack, null];
    } catch (err) {
      const parsedError = err instanceof DeviceError ? err : new UnknownDeviceError({ cause: err });
      this.error = parsedError;
      this.notify();
      return [null, parsedError];
    }
  }
  stopDevice() {
    if (this.stream) stopStream(this.stream, this.deps.type);
    this.deps.invalidateInitialStream();
    this.setStream(null);
    this.notify();
  }
  enableDevice() {
    const track = this.deviceTrack;
    if (!track) return;
    track.enabled = true;
    this.isEnabled = true;
    this.notify();
  }
  disableDevice() {
    const track = this.deviceTrack;
    if (!track) return;
    track.enabled = false;
    this.isEnabled = false;
    this.notify();
  }
  async applyMiddleware(newMiddleware) {
    this.middlewareCleanup?.();
    this.middlewareCleanup = null;
    this.middleware = newMiddleware;
    const rawTrack = this.rawTrack;
    if (newMiddleware && rawTrack) {
      const { track, onClear } = await newMiddleware(rawTrack);
      this.middlewareCleanup = onClear ?? null;
      this.processedTrack = track;
      this.notify();
      return track;
    }
    this.processedTrack = null;
    this.notify();
    return rawTrack;
  }
  // --- streaming layer (ties the local device to the room) ---
  async start(deviceId) {
    const [track, error] = await this.startDevice(deviceId);
    if (error) return error;
    const currentTrackId = await this.getCurrentTrackId();
    if (currentTrackId) {
      await this.resumeStreaming(currentTrackId, track);
    } else if (this.deps.getPeerStatus() === "connected") {
      await this.startStreaming(track);
    }
    return undefined;
  }
  async stop() {
    const currentTrackId = await this.getCurrentTrackId();
    this.stopDevice();
    if (currentTrackId) await this.pauseStreaming(currentTrackId);
  }
  async toggleDevice() {
    const currentTrackId = await this.getCurrentTrackId();
    if (this.deviceTrack) {
      this.stopDevice();
      if (currentTrackId) await this.pauseStreaming(currentTrackId);
      return undefined;
    }
    const [newTrack, error] = await this.startDevice();
    if (error) return error;
    if (currentTrackId) {
      await this.resumeStreaming(currentTrackId, newTrack);
    } else if (this.deps.getPeerStatus() === "connected") {
      await this.startStreaming(newTrack);
    }
    return undefined;
  }
  async toggleMute() {
    const currentTrackId = await this.getCurrentTrackId();
    const isTrackCurrentlyEnabled = Boolean(this.deviceTrack?.enabled);
    if (!currentTrackId) {
      this.deps.logger.warn("Toggling mute is only possible while connected to a room.");
      return;
    }
    if (isTrackCurrentlyEnabled) {
      this.disableDevice();
      await this.pauseStreaming(currentTrackId);
    } else if (this.deviceTrack) {
      this.enableDevice();
      await this.resumeStreaming(currentTrackId, this.deviceTrack);
    }
  }
  async selectDevice(deviceId) {
    if (!this.deviceTrack) {
      const device = this.deps.getAvailableDevices().find((d) => d.deviceId === deviceId);
      if (device) this.setSelectedDevice(device);
      return undefined;
    }
    const [newTrack, error] = await this.startDevice(deviceId);
    if (error) return error;
    const currentTrackId = await this.getCurrentTrackId();
    if (!currentTrackId) return undefined;
    await this.deps.publisher.replaceTrack(currentTrackId, newTrack);
    return undefined;
  }
  async setTrackMiddleware(middleware) {
    const processedTrack = await this.applyMiddleware(middleware);
    const currentTrackId = await this.getCurrentTrackId();
    if (!currentTrackId) return;
    await this.deps.publisher.replaceTrack(currentTrackId, processedTrack);
  }
  dispose() {
    for (const cleanup of this.sessionCleanups) cleanup();
    this.middlewareCleanup?.();
    this.middlewareCleanup = null;
    if (this.stream) stopStream(this.stream, this.deps.type);
    this.setStream(null);
  }
  async getCurrentTrackId() {
    if (this.connectionPromise) {
      await this.connectionPromise.catch(() => undefined);
    }
    if (!this.currentTrackId) return null;
    return this.deps.publisher.resolveRemoteTrackId(this.currentTrackId);
  }
  async startStreaming(track) {
    // temporarily setting the local trackId until we have the remoteTrackId
    this.currentTrackId = track.id;
    const trackMetadata = { type: this.deps.type === "video" ? "camera" : "microphone", paused: false };
    const displayName = this.deps.publisher.getDisplayName();
    if (displayName) trackMetadata.displayName = displayName;
    const sentQualities = this.deps.streamConfig?.sentQualities ?? DEFAULT_SENT_QUALITIES;
    const [maxBandwidth, simulcastConfig] = getConfigAndBandwidthFromProps(sentQualities, this.deps.bandwidthLimits);
    try {
      const addTrackJob = this.deps.publisher.addTrack(track, trackMetadata, simulcastConfig, maxBandwidth);
      this.connectionPromise = addTrackJob;
      this.currentTrackId = await addTrackJob;
    } catch (err) {
      if (err instanceof TrackTypeError) {
        this.deps.logger.warn(err.message);
        this.currentTrackId = null;
      }
      throw err;
    }
  }
  async pauseStreaming(trackId) {
    if (this.deps.getPeerStatus() !== "connected") return;
    await this.deps.publisher.replaceTrack(trackId, null);
    this.deps.publisher.updateTrackMetadata(trackId, {
      type: this.deps.type === "video" ? "camera" : "microphone",
      paused: true,
    });
  }
  async resumeStreaming(trackId, track) {
    if (this.deps.getPeerStatus() !== "connected") return;
    await this.deps.publisher.replaceTrack(trackId, track);
    this.deps.publisher.updateTrackMetadata(trackId, {
      type: this.deps.type === "video" ? "camera" : "microphone",
      paused: false,
    });
  }
  handleJoined() {
    const track = this.deviceTrack;
    if (!track) return;
    // The handler is sync; observe rejections so non-TrackTypeError failures
    // from addTrack don't surface as unhandledrejection.
    void this.startStreaming(track).catch((err) => {
      if (err instanceof TrackTypeError) return;
      this.deps.logger.error(err);
    });
  }
  handleDisconnected() {
    this.currentTrackId = null;
    this.connectionPromise = null;
  }
  setStream(stream) {
    this.trackEndCleanup?.();
    this.trackEndCleanup = null;
    this.stream = stream;
    if (!stream) {
      if (this.processedTrack) {
        this.processedTrack.stop();
        this.middlewareCleanup?.();
        this.middlewareCleanup = null;
        this.processedTrack = null;
      }
      return;
    }
    const rawTrack = getTrackFromStream(stream, this.deps.type);
    if (!rawTrack) return;
    const handleTrackEnded = () => {
      if (this.rawTrack !== rawTrack) return;
      this.setStream(null);
      this.notify();
    };
    rawTrack.addEventListener?.("ended", handleTrackEnded);
    this.trackEndCleanup = () => rawTrack.removeEventListener?.("ended", handleTrackEnded);
  }
  notify() {
    this.deps.onStateChanged();
  }
}
