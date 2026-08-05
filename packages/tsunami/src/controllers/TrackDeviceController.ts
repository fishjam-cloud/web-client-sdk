import { type Logger, type TrackMetadata, TrackTypeError, Variant } from "@fishjam-cloud/ts-client";

import type {
  DeviceItem,
  DeviceType,
  IDeviceManager,
  PlatformMediaStream,
  PlatformMediaStreamTrack,
} from "../devices/deviceManager";
import { DeviceError, UnknownDeviceError } from "../devices/errors";
import type { BandwidthLimits, StreamConfig, TrackMiddleware } from "../mediaTypes";
import type { LocalDeviceState, PeerStatus } from "../state/clientState";
import { getConfigAndBandwidthFromProps, getTrackFromStream, stopStream } from "../tracks/trackUtils";
import type { TrackPublisher } from "./TrackPublisher";

export type TrackDeviceControllerDeps = {
  type: DeviceType;
  publisher: TrackPublisher;
  deviceManager: IDeviceManager<PlatformMediaStream>;
  constraints: MediaTrackConstraints | boolean | undefined;
  bandwidthLimits: BandwidthLimits;
  streamConfig?: StreamConfig;
  logger: Logger;
  getPeerStatus: () => PeerStatus;
  /** Devices of this controller's kind, from the orchestrator's last enumeration. */
  getAvailableDevices: () => DeviceItem[];
  getInitialStream: () => Promise<PlatformMediaStream | null>;
  /** Called when this controller replaces its stream, so the shared initial stream stops being reused. */
  invalidateInitialStream: () => void;
  onSelectedDeviceChanged: (device: DeviceItem) => void;
  onStateChanged: () => void;
};

const DEFAULT_SENT_QUALITIES: Variant[] = [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH];

/**
 * Owns the full lifecycle of one local media device (camera or microphone):
 * acquisition, soft mute, middleware, device switching, and publishing the
 * resulting track to the room.
 */
export class TrackDeviceController {
  public error: DeviceError | null = null;

  private stream: PlatformMediaStream | null = null;
  private processedTrack: PlatformMediaStreamTrack | null = null;
  private middleware: TrackMiddleware = null;
  private middlewareCleanup: (() => void) | null = null;
  private isEnabled = true;
  private selectedDevice: DeviceItem | null = null;

  private currentTrackId: string | null = null;
  private connectionPromise: Promise<string> | null = null;

  private trackEndCleanup: (() => void) | null = null;
  private readonly sessionCleanups: (() => void)[];
  private lastSnapshot: LocalDeviceState | null = null;

  public constructor(private readonly deps: TrackDeviceControllerDeps) {
    this.sessionCleanups = [
      deps.publisher.onJoined(() => this.handleJoined()),
      deps.publisher.onDisconnected(() => this.handleDisconnected()),
    ];
  }

  public get rawTrack(): PlatformMediaStreamTrack | null {
    return this.stream && getTrackFromStream(this.stream, this.deps.type);
  }

  public get deviceTrack(): PlatformMediaStreamTrack | null {
    return this.processedTrack ?? this.rawTrack;
  }

  public snapshot(): LocalDeviceState {
    const rawDeviceId = this.rawTrack?.getSettings().deviceId;
    const next: LocalDeviceState = {
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
  public adoptInitialStream(stream: PlatformMediaStream | null): void {
    if (!stream || this.stream) return;
    this.setStream(stream);
    this.notify();
  }

  public setSelectedDevice(device: DeviceItem): void {
    this.selectedDevice = device;
    this.deps.onSelectedDeviceChanged(device);
    this.notify();
  }

  public setError(error: DeviceError | null): void {
    this.error = error;
    this.notify();
  }

  public async startDevice(
    deviceId: string | undefined = this.selectedDevice?.deviceId,
  ): Promise<[PlatformMediaStreamTrack, null] | [null, DeviceError]> {
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

  public stopDevice(): void {
    if (this.stream) stopStream(this.stream, this.deps.type);
    this.deps.invalidateInitialStream();
    this.setStream(null);
    this.notify();
  }

  public enableDevice(): void {
    const track = this.deviceTrack;
    if (!track) return;
    track.enabled = true;
    this.isEnabled = true;
    this.notify();
  }

  public disableDevice(): void {
    const track = this.deviceTrack;
    if (!track) return;
    track.enabled = false;
    this.isEnabled = false;
    this.notify();
  }

  public async applyMiddleware(newMiddleware: TrackMiddleware): Promise<PlatformMediaStreamTrack | null> {
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

  public async start(deviceId?: string): Promise<DeviceError | undefined> {
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

  public async stop(): Promise<void> {
    const currentTrackId = await this.getCurrentTrackId();
    this.stopDevice();
    if (currentTrackId) await this.pauseStreaming(currentTrackId);
  }

  public async toggleDevice(): Promise<DeviceError | undefined> {
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

  public async toggleMute(): Promise<void> {
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

  public async selectDevice(deviceId: string): Promise<DeviceError | undefined> {
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

  public async setTrackMiddleware(middleware: TrackMiddleware): Promise<void> {
    const processedTrack = await this.applyMiddleware(middleware);

    const currentTrackId = await this.getCurrentTrackId();
    if (!currentTrackId) return;

    await this.deps.publisher.replaceTrack(currentTrackId, processedTrack);
  }

  public dispose(): void {
    for (const cleanup of this.sessionCleanups) cleanup();
    this.middlewareCleanup?.();
    this.middlewareCleanup = null;
    if (this.stream) stopStream(this.stream, this.deps.type);
    this.setStream(null);
  }

  private async getCurrentTrackId(): Promise<string | null> {
    if (this.connectionPromise) {
      await this.connectionPromise.catch(() => undefined);
    }
    if (!this.currentTrackId) return null;
    return this.deps.publisher.resolveRemoteTrackId(this.currentTrackId);
  }

  private async startStreaming(track: PlatformMediaStreamTrack): Promise<void> {
    // temporarily setting the local trackId until we have the remoteTrackId
    this.currentTrackId = track.id;

    const trackMetadata: TrackMetadata = { type: this.deps.type === "video" ? "camera" : "microphone", paused: false };

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

  private async pauseStreaming(trackId: string): Promise<void> {
    if (this.deps.getPeerStatus() !== "connected") return;
    await this.deps.publisher.replaceTrack(trackId, null);
    this.deps.publisher.updateTrackMetadata(trackId, {
      type: this.deps.type === "video" ? "camera" : "microphone",
      paused: true,
    });
  }

  private async resumeStreaming(trackId: string, track: PlatformMediaStreamTrack): Promise<void> {
    if (this.deps.getPeerStatus() !== "connected") return;
    await this.deps.publisher.replaceTrack(trackId, track);
    this.deps.publisher.updateTrackMetadata(trackId, {
      type: this.deps.type === "video" ? "camera" : "microphone",
      paused: false,
    });
  }

  private handleJoined(): void {
    const track = this.deviceTrack;
    if (!track) return;
    // The handler is sync; observe rejections so non-TrackTypeError failures
    // from addTrack don't surface as unhandledrejection.
    void this.startStreaming(track).catch((err) => {
      if (err instanceof TrackTypeError) return;
      this.deps.logger.error(err);
    });
  }

  private handleDisconnected(): void {
    this.currentTrackId = null;
    this.connectionPromise = null;
  }

  private setStream(stream: PlatformMediaStream | null): void {
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

  private notify(): void {
    this.deps.onStateChanged();
  }
}
