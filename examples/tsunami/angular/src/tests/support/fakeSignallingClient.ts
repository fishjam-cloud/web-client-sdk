import type {
  ConnectConfig,
  FishjamClientConfig,
  GenericMetadata,
  Peer,
  SimulcastConfig,
  TrackBandwidthLimit,
  TrackMetadata,
} from "@fishjam-cloud/tsunami";
import { EventEmitter } from "events";
import { vi } from "vitest";

import { FakeMediaStream } from "./fakeMediaStream";

/**
 * The signalling client type tsunami accepts through its injection seam.
 * Deriving it from the config keeps this file importing only from tsunami.
 */
export type SignallingClient = NonNullable<FishjamClientConfig["signallingClient"]>;

/**
 * The exact subset of the signalling client tsunami calls. Deriving it with
 * `Pick` is the point: if any of these is renamed, removed or re-signed on the
 * real client, the `asClient()` guard below stops compiling, flagging that the
 * fake has drifted. `on`/`off`/`emit` are intentionally NOT included — the
 * fake's EventEmitter base is deliberately permissive so tests can drive
 * events.
 */
type SignallingClientContract = Pick<
  SignallingClient,
  | "status"
  | "connect"
  | "disconnect"
  | "cleanup"
  | "addTrack"
  | "replaceTrack"
  | "removeTrack"
  | "updateTrackMetadata"
  | "getLocalPeer"
  | "getRemotePeers"
  | "getRemoteComponents"
  | "getRemoteTracks"
  | "isReconnecting"
>;

/** In-memory track context mirroring the slice of `FishjamTrackContext` the SDK reads. */
export class FakeTrackContext extends EventEmitter {
  public constructor(
    public trackId: string,
    public track: MediaStreamTrack | null,
    public metadata: TrackMetadata | undefined,
    public stream: MediaStream | null,
  ) {
    super();
  }
}

export type FakePeerInit = {
  id: string;
  metadata?: Peer["metadata"];
  tracks?: { trackId: string; metadata: TrackMetadata; track?: MediaStreamTrack | null }[];
};

const buildPeer = (init: FakePeerInit): Peer => {
  const tracks = new Map<string, FakeTrackContext>();
  for (const trackInit of init.tracks ?? []) {
    tracks.set(
      trackInit.trackId,
      new FakeTrackContext(
        trackInit.trackId,
        trackInit.track ?? null,
        trackInit.metadata,
        new FakeMediaStream(trackInit.track ? [trackInit.track] : []),
      ),
    );
  }
  return {
    id: init.id,
    type: "webrtc",
    metadata: init.metadata,
    // FakeTrackContext implements only the read surface of FishjamTrackContext;
    // this cast erases the unimplemented remainder.
    tracks: tracks as unknown as Peer["tracks"],
  } satisfies Peer;
};

/**
 * Behavioral double for the ts-client signalling layer, injected through
 * tsunami's `signallingClient` config seam. Implements only the surface
 * tsunami uses, with spies on every mutating method and `simulate*` helpers to
 * drive the event-based state machine deterministically. Modeled on the
 * react-client `FakeFishjamClient`.
 */
export class FakeSignallingClient extends EventEmitter {
  // Mirrors the real client: starts `"new"` and only becomes `"initialized"`
  // inside connect(). Publishing paths gated on `status === "initialized"`
  // (e.g. screen share) therefore behave as they do in production.
  public status: "new" | "initialized" = "new";

  public localPeer: Peer | null = null;
  public remotePeers: Record<string, Peer> = {};

  private trackIdCounter = 0;
  private reconnecting = false;

  // ---- spies (assert call args / counts) -------------------------------

  // Faithful to the real connect(): emits `connectionStarted`, flips status to
  // `initialized`, and only resolves once `joined` fires (rejects on
  // join/auth/socket errors). A test that awaits connect() must drive
  // `simulateJoined()` for the await to settle.
  public connect = vi.fn((_config: ConnectConfig<GenericMetadata>) => {
    this.emit("connectionStarted");
    this.status = "initialized";
    return new Promise<void>((resolve, reject) => {
      const errorEvents = ["joinError", "authError", "socketError"] as const;
      const onSuccess = () => {
        cleanupListeners();
        resolve();
      };
      const errorHandlers = errorEvents.map((event) => {
        const handler = () => {
          cleanupListeners();
          reject(new Error(`FakeSignallingClient: "${event}" emitted while connect() was pending`));
        };
        return [event, handler] as const;
      });
      const cleanupListeners = () => {
        this.off("joined", onSuccess);
        for (const [event, handler] of errorHandlers) this.off(event, handler);
      };
      this.on("joined", onSuccess);
      for (const [event, handler] of errorHandlers) this.on(event, handler);
    });
  });

  public disconnect = vi.fn(() => {
    this.simulateDisconnected();
  });

  public cleanup = vi.fn();

  public addTrack = vi.fn(
    (
      track: MediaStreamTrack,
      metadata?: TrackMetadata,
      _simulcastConfig?: SimulcastConfig,
      _maxBandwidth?: TrackBandwidthLimit,
    ): Promise<string> => {
      const remoteTrackId = `remote-${this.trackIdCounter++}`;
      if (!this.localPeer) this.localPeer = buildPeer({ id: "local-peer" });
      (this.localPeer.tracks as unknown as Map<string, FakeTrackContext>).set(
        remoteTrackId,
        new FakeTrackContext(remoteTrackId, track, metadata, new FakeMediaStream([track])),
      );
      this.emit("localTrackAdded");
      return Promise.resolve(remoteTrackId);
    },
  );

  public replaceTrack = vi.fn(async (trackId: string, newTrack: MediaStreamTrack | null) => {
    const context = (this.localPeer?.tracks as unknown as Map<string, FakeTrackContext> | undefined)?.get(trackId);
    if (context) context.track = newTrack;
    this.emit("localTrackReplaced", { trackId, track: newTrack });
  });

  public removeTrack = vi.fn(async (trackId: string) => {
    (this.localPeer?.tracks as unknown as Map<string, FakeTrackContext> | undefined)?.delete(trackId);
    this.emit("localTrackRemoved", { trackId });
  });

  public updateTrackMetadata = vi.fn((trackId: string, metadata: TrackMetadata) => {
    const context = (this.localPeer?.tracks as unknown as Map<string, FakeTrackContext> | undefined)?.get(trackId);
    if (context) context.metadata = metadata;
    this.emit("localTrackMetadataChanged", { trackId, metadata });
  });

  // ---- read methods ----------------------------------------------------

  public getLocalPeer = () => this.localPeer;
  public getRemotePeers = () => this.remotePeers;
  public getRemoteComponents = () => ({});
  public getRemoteTracks = () => ({});
  public isReconnecting = () => this.reconnecting;

  public asClient(): SignallingClient {
    // Drift tripwire: `this` must satisfy the surface tsunami uses (see
    // SignallingClientContract). The final `as unknown` only erases the unused
    // remainder of the (large, partly-private) ts-client surface.
    return this satisfies SignallingClientContract as unknown as SignallingClient;
  }

  // ---- test controls ---------------------------------------------------

  public addRemotePeer(init: FakePeerInit): void {
    this.remotePeers[init.id] = buildPeer(init);
    this.emit("peerJoined", this.remotePeers[init.id]);
  }

  public removeRemotePeer(peerId: string): void {
    const peer = this.remotePeers[peerId];
    delete this.remotePeers[peerId];
    this.emit("peerLeft", peer);
  }

  public simulateConnectionStarted(): void {
    this.emit("connectionStarted");
  }

  public simulateJoined(): void {
    // You cannot be joined without having connected, so status must already be
    // `initialized` here (connect() sets it; this covers tests that jump
    // straight to the joined state without awaiting connect()).
    this.status = "initialized";
    if (!this.localPeer) this.localPeer = buildPeer({ id: "local-peer" });
    this.emit("joined");
  }

  public simulateReconnectionStarted(): void {
    this.reconnecting = true;
    this.emit("reconnectionStarted");
  }

  public simulateReconnected(): void {
    this.reconnecting = false;
    this.emit("reconnected");
  }

  public simulateReconnectionRetriesLimitReached(): void {
    this.emit("reconnectionRetriesLimitReached");
  }

  public simulateAuthError(): void {
    this.emit("authError");
  }

  public simulateJoinError(): void {
    this.emit("joinError");
  }

  public simulateConnectionError(): void {
    this.emit("connectionError");
  }

  public simulateDisconnected(): void {
    this.localPeer = null;
    this.remotePeers = {};
    this.emit("disconnected");
  }
}
