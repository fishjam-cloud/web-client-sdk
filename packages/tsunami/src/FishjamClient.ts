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
  type MessageEvents,
  type Peer,
  type SimulcastConfig,
  type TrackBandwidthLimit,
  type TrackMetadata,
  type Variant,
} from "@fishjam-cloud/ts-client";
import { EventEmitter } from "events";
import type TypedEmitter from "typed-emitter";

import { ClientResourceScope } from "./ClientResourceScope";

type LegacyClientInternals<PeerMetadata> = {
  reconnectManager?: { reset(metadata: PeerMetadata): void };
  sendStatisticsInterval?: ReturnType<typeof setInterval>;
};

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

  public constructor(config?: CreateConfig) {
    super();
    this.config = config;
  }

  public get isDisposed(): boolean {
    return this.resources.isDisposed;
  }

  /** Signalling initialization status retained for ts-client compatibility. */
  public get status(): TsClient<PeerMetadata, ServerMetadata>["status"] {
    return this.tsClient?.status ?? "new";
  }

  public emit<Event extends keyof MessageEvents<PeerMetadata, ServerMetadata>>(
    event: Event,
    ...args: Parameters<MessageEvents<PeerMetadata, ServerMetadata>[Event]>
  ): boolean;
  public emit(event: string | symbol, ...args: unknown[]): boolean {
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
    return this.resources.run(() => this.getTsClient().createDataChannels());
  }

  public publishData(data: Uint8Array, options: DataChannelOptions): void {
    this.resources.assertActive();
    this.getTsClient().publishData(data, options);
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

  private getTsClient(): TsClient<PeerMetadata, ServerMetadata> {
    this.resources.assertActive();
    if (this.tsClient) return this.tsClient;

    const tsClient = new TsClient<PeerMetadata, ServerMetadata>(this.config);
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
