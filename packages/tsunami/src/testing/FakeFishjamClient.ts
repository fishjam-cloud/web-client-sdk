import {
  type AuthErrorReason,
  type Component,
  type ConnectConfig,
  type DataCallback,
  type DataChannelOptions,
  type FishjamClient,
  type FishjamTrackContext,
  type GenericMetadata,
  type JoinErrorReason,
  type MessageEvents,
  type Peer,
  type SimulcastConfig,
  type TrackBandwidthLimit,
  type TrackMetadata,
  TrackTypeError,
  type VadStatus,
  type Variant,
} from "@fishjam-cloud/ts-client";
import { EventEmitter } from "events";
import type TypedEmitter from "typed-emitter";
import { vi } from "vitest";

import { Deferred } from "./Deferred";
import { FakeMediaStream } from "./FakeMediaStream";

/**
 * The signalling surface used by the SDK. This Pick is a compile-time drift
 * tripwire: a changed ts-client method signature makes the fake stop compiling.
 */
export type FishjamClientContract<PeerMetadata = GenericMetadata, ServerMetadata = GenericMetadata> = Pick<
  FishjamClient<PeerMetadata, ServerMetadata>,
  | "status"
  | "connect"
  | "disconnect"
  | "addTrack"
  | "replaceTrack"
  | "removeTrack"
  | "updateTrackMetadata"
  | "updatePeerMetadata"
  | "setTargetTrackEncoding"
  | "createDataChannels"
  | "publishData"
  | "subscribeData"
  | "getStatistics"
  | "getLocalPeer"
  | "getRemotePeers"
  | "getRemoteComponents"
  | "isReconnecting"
  | "getDataChannelsReadiness"
  | "getLocalTrackAudioLevel"
>;

type TrackContextContract = Pick<
  FishjamTrackContext,
  "trackId" | "track" | "metadata" | "stream" | "simulcastConfig" | "vadStatus"
>;

export class FakeTrackContext extends EventEmitter implements TrackContextContract {
  vadStatus: VadStatus = "silence";

  constructor(
    public trackId: string,
    public track: MediaStreamTrack | null,
    public metadata: TrackMetadata | undefined,
    public stream: MediaStream | null,
    public simulcastConfig?: SimulcastConfig,
  ) {
    super();
  }

  simulateVad(status: VadStatus): void {
    this.vadStatus = status;
    this.emit("voiceActivityChanged", this);
  }
}

export type FakePeerInit<PeerMetadata = GenericMetadata, ServerMetadata = GenericMetadata> = {
  id: string;
  metadata?: Peer<PeerMetadata, ServerMetadata>["metadata"];
  tracks?: { trackId: string; metadata: TrackMetadata; track?: MediaStreamTrack | null }[];
};

const buildPeer = <PeerMetadata, ServerMetadata>(
  init: FakePeerInit<PeerMetadata, ServerMetadata>,
): Peer<PeerMetadata, ServerMetadata> => {
  const tracks = new Map<string, FakeTrackContext>();
  for (const track of init.tracks ?? []) {
    tracks.set(
      track.trackId,
      new FakeTrackContext(
        track.trackId,
        track.track ?? null,
        track.metadata,
        new FakeMediaStream(track.track ? [track.track] : []),
      ),
    );
  }
  return {
    id: init.id,
    type: "webrtc",
    metadata: init.metadata,
    tracks: tracks as unknown as Peer<PeerMetadata, ServerMetadata>["tracks"],
  } satisfies Peer<PeerMetadata, ServerMetadata>;
};

/** Faithful, controllable test double for the stable ts-client signalling seam. */
export class FakeFishjamClient<
  PeerMetadata = GenericMetadata,
  ServerMetadata = GenericMetadata,
> extends (EventEmitter as {
  new <P, S>(): TypedEmitter<MessageEvents<P, S>>;
})<PeerMetadata, ServerMetadata> {
  status: "new" | "initialized" = "new";

  connect = vi.fn((_config: ConnectConfig<PeerMetadata>) => {
    this.emit("connectionStarted");
    this.status = "initialized";
    return new Promise<void>((resolve, reject) => {
      const errorEvents = ["joinError", "authError", "socketError"] as const;
      const onSuccess = () => {
        cleanup();
        resolve();
      };
      const errorHandlers = errorEvents.map((event) => {
        const handler = () => {
          cleanup();
          reject(new Error(`FakeFishjamClient: "${event}" emitted while connect() was pending`));
        };
        return [event, handler] as const;
      });
      const cleanup = () => {
        this.off("joined", onSuccess);
        for (const [event, handler] of errorHandlers) this.off(event, handler);
      };
      this.on("joined", onSuccess);
      for (const [event, handler] of errorHandlers) this.on(event, handler);
    });
  });

  disconnect = vi.fn(() => {
    this.simulateDisconnected();
  });

  replaceTrack = vi.fn(async (trackId: string, newTrack: MediaStreamTrack | null) => {
    const context = this.localPeer?.tracks.get(trackId) as FakeTrackContext | undefined;
    if (context) {
      if (context.track) context.stream?.removeTrack(context.track);
      if (newTrack) context.stream?.addTrack(newTrack);
      context.track = newTrack;
    }
    this.emit("localTrackReplaced", { trackId, track: newTrack });
  });

  removeTrack = vi.fn(async (trackId: string) => {
    const context = this.localPeer?.tracks.get(trackId) as FakeTrackContext | undefined;
    if (context?.track) context.stream?.removeTrack(context.track);
    this.localPeer?.tracks.delete(trackId);
    this.emit("localTrackRemoved", { trackId });
  });

  updateTrackMetadata = vi.fn((trackId: string, metadata: TrackMetadata) => {
    const context = this.localPeer?.tracks.get(trackId) as FakeTrackContext | undefined;
    if (context) context.metadata = metadata;
    this.emit("localTrackMetadataChanged", { trackId, metadata });
  });

  updatePeerMetadata = vi.fn((metadata: PeerMetadata) => {
    if (this.localPeer) {
      this.localPeer.metadata = {
        peer: metadata,
        server: this.localPeer.metadata?.server as ServerMetadata,
      };
    }
    this.emit("localPeerMetadataChanged", { metadata });
  });

  setTargetTrackEncoding = vi.fn((_trackId: string, _variant: Variant) => {});

  createDataChannels = vi.fn(async () => {
    this.dataChannelsReady = true;
    this.emit("dataChannelsReady");
  });

  publishData = vi.fn((_data: Uint8Array, _options: DataChannelOptions) => {});

  subscribeData = vi.fn((callback: DataCallback, _options: DataChannelOptions) => {
    this.dataSubscribers.add(callback);
    return () => this.dataSubscribers.delete(callback);
  });

  getStatistics = vi.fn(async () => ({}) as RTCStatsReport);

  addTrack = vi.fn(
    (
      track: MediaStreamTrack,
      metadata?: TrackMetadata,
      simulcastConfig: SimulcastConfig = { enabled: false, enabledVariants: [], disabledVariants: [] },
      maxBandwidth: TrackBandwidthLimit = 0,
    ): Promise<string> => {
      if (this.audioOnlyConnection && track.kind !== "audio") throw new TrackTypeError();

      const trackId = `remote-${this.trackIdCounter++}`;
      const register = () => {
        if (!this.localPeer) this.localPeer = buildPeer({ id: "local-peer" });
        const stream = new FakeMediaStream([track]);
        (this.localPeer.tracks as Map<string, unknown>).set(
          trackId,
          new FakeTrackContext(trackId, track, metadata, stream, simulcastConfig),
        );
        this.emit("localTrackAdded", {
          trackId,
          track,
          stream,
          trackMetadata: metadata,
          simulcastConfig,
          maxBandwidth,
        });
      };

      if (this.autoResolveAddTrack) {
        register();
        return Promise.resolve(trackId);
      }

      const deferred = new Deferred<string>();
      this.pendingAddTracks.push(() => {
        register();
        deferred.resolve(trackId);
      });
      return deferred.promise;
    },
  );

  private trackIdCounter = 0;
  private autoResolveAddTrack = true;
  private pendingAddTracks: (() => void)[] = [];
  private dataChannelsReady = false;
  private dataSubscribers = new Set<DataCallback>();
  private reconnecting = false;
  private audioOnlyConnection = false;

  localPeer: Peer<PeerMetadata, ServerMetadata> | null = null;
  remotePeers: Record<string, Peer<PeerMetadata, ServerMetadata>> = {};

  getLocalPeer = () => this.localPeer;
  getRemotePeers = () => this.remotePeers;
  getRemoteComponents = () => ({});
  isReconnecting = () => this.reconnecting;
  getDataChannelsReadiness = () => this.dataChannelsReady;
  getLocalTrackAudioLevel = async (_trackId: string) => null;

  asClient(): FishjamClient<PeerMetadata, ServerMetadata> {
    return this satisfies FishjamClientContract<PeerMetadata, ServerMetadata> as unknown as FishjamClient<
      PeerMetadata,
      ServerMetadata
    >;
  }

  deferAddTracks(): void {
    this.autoResolveAddTrack = false;
  }

  flushAddTracks(): void {
    const pending = this.pendingAddTracks;
    this.pendingAddTracks = [];
    pending.forEach((resolve) => resolve());
  }

  simulateAudioOnlyRoom(): void {
    this.audioOnlyConnection = true;
  }

  setLocalPeer(init: FakePeerInit<PeerMetadata, ServerMetadata>): void {
    this.localPeer = buildPeer(init);
    this.emit("joined", init.id, Object.values(this.remotePeers), []);
  }

  addRemotePeer(init: FakePeerInit<PeerMetadata, ServerMetadata>): void {
    this.remotePeers[init.id] = buildPeer(init);
    this.emit("peerJoined", this.remotePeers[init.id]);
  }

  getRemoteTrackContext(peerId: string, trackId: string): FakeTrackContext | undefined {
    return this.remotePeers[peerId]?.tracks.get(trackId) as FakeTrackContext | undefined;
  }

  simulateConnectionStarted(): void {
    this.emit("connectionStarted");
  }

  simulateJoined(
    peerId = this.localPeer?.id ?? "local-peer",
    peers: Peer<PeerMetadata, ServerMetadata>[] = Object.values(this.remotePeers),
    components: Component[] = [],
  ): void {
    this.status = "initialized";
    if (!this.localPeer) this.localPeer = buildPeer({ id: peerId });
    this.emit("joined", peerId, peers, components);
  }

  simulateReconnectionStarted(): void {
    this.reconnecting = true;
    this.emit("reconnectionStarted");
  }

  simulateReconnected(): void {
    this.reconnecting = false;
    this.emit("reconnected");
  }

  simulateReconnectionRetriesLimitReached(): void {
    this.emit("reconnectionRetriesLimitReached");
  }

  simulateAuthError(reason: AuthErrorReason = "invalid token"): void {
    this.emit("authError", reason);
  }

  simulateJoinError(reason: JoinErrorReason | unknown = "reached peers limit"): void {
    this.emit("joinError", reason);
  }

  simulateSocketError(): void {
    this.emit("socketError", new Event("error"));
  }

  simulateConnectionError(error: { message: string; event?: Event } = { message: "Fake connection error" }): void {
    this.emit("connectionError", error);
  }

  simulateDisconnected(): void {
    this.localPeer = null;
    this.remotePeers = {};
    this.dataChannelsReady = false;
    this.emit("disconnected");
  }

  simulateDataChannelsError(error: Error): void {
    this.emit("dataChannelsError", error);
  }

  simulateIncomingData(data: Uint8Array): void {
    this.dataSubscribers.forEach((callback) => callback(data));
  }
}
