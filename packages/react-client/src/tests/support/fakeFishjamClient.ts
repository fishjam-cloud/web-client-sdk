import {
  type DataCallback,
  type DataChannelOptions,
  type FishjamClient,
  type FishjamTrackContext,
  type Peer,
  type SimulcastConfig,
  type TrackMetadata,
  TrackTypeError,
  type VadStatus,
  type Variant,
} from "@fishjam-cloud/ts-client";
import { EventEmitter } from "events";
import { vi } from "vitest";

import { Deferred } from "../../utils/deferred";
import { FakeMediaStream } from "./fakeMediaStream";

/**
 * The exact subset of `FishjamClient` command/query methods the React SDK
 * depends on. Deriving it with `Pick` (rather than re-declaring signatures) is
 * the point: if any of these is renamed, removed, or re-signed on the real
 * client, this type — and the `asClient()` guard built on it — fails to compile,
 * flagging that the fake has drifted. Add a key here whenever the SDK starts
 * calling a new client method.
 *
 * `on`/`off`/`removeListener` are intentionally NOT included: they return `this`
 * (chainable), so the real client's signatures would require the fake to BE a
 * FishjamClient. They don't need re-guarding here anyway — `FishjamProvider`
 * holds the real, fully-typed client, so any event rename or listener-signature
 * change breaks the production hooks' `client.on(...)` calls directly. The fake's
 * EventEmitter base is deliberately permissive so tests can drive those events.
 */
export type FishjamClientContract = Pick<
  FishjamClient,
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

/**
 * The slice of `FishjamTrackContext` the SDK reads — same drift-tripwire idea
 * as `FishjamClientContract`: if the real context renames or re-types any of
 * these fields, `FakeTrackContext` stops compiling.
 */
type TrackContextContract = Pick<
  FishjamTrackContext,
  "trackId" | "track" | "metadata" | "stream" | "simulcastConfig" | "vadStatus"
>;

/**
 * In-memory track context, mirroring the slice of `FishjamTrackContext` the SDK
 * reads. It is an EventEmitter so `voiceActivityChanged` can be driven, and
 * `vadStatus` is mutable in place (the real client mutates it the same way,
 * which is why `useVAD` needs its own re-render trigger).
 */
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

  simulateVad(status: VadStatus) {
    this.vadStatus = status;
    this.emit("voiceActivityChanged", this);
  }
}

export type FakePeerInit = {
  id: string;
  metadata?: Peer["metadata"];
  tracks?: { trackId: string; metadata: TrackMetadata; track?: MediaStreamTrack | null }[];
};

const buildPeer = (init: FakePeerInit): Peer => {
  const tracks = new Map<string, FakeTrackContext>();
  for (const t of init.tracks ?? []) {
    tracks.set(
      t.trackId,
      new FakeTrackContext(t.trackId, t.track ?? null, t.metadata, new FakeMediaStream(t.track ? [t.track] : [])),
    );
  }
  return {
    id: init.id,
    type: "webrtc",
    metadata: init.metadata,
    // FakeTrackContext implements only the read surface of FishjamTrackContext
    // (TrackContextContract); this cast erases the unimplemented remainder.
    tracks: tracks as unknown as Peer["tracks"],
  } satisfies Peer;
};

/**
 * Behavioral double for `FishjamClient`. Implements only the surface the SDK
 * uses, with spies on every mutating method and `simulate*` helpers to drive
 * the event-based state machine deterministically.
 *
 * Cast with `asClient()` when handing to `FishjamProvider`.
 */
export class FakeFishjamClient extends EventEmitter {
  // Mirrors the real client: starts `"new"` and only becomes `"initialized"`
  // inside connect(). Publishing paths gated on `status === "initialized"`
  // (e.g. screenshare) therefore behave as they do in production.
  status: "new" | "initialized" = "new";

  // ---- spies (assert call args / counts) -------------------------------
  // Faithful to the real connect(): emits `connectionStarted`, flips status to
  // `initialized`, and only resolves once `joined` fires (rejects on
  // join/auth/socket errors), mirroring connectEventsHandler. A test that
  // awaits joinRoom() must drive `simulateJoined()` for the await to settle.
  connect = vi.fn((_config: unknown) => {
    this.emit("connectionStarted");
    this.status = "initialized";
    return new Promise<void>((resolve, reject) => {
      const onSuccess = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject();
      };
      const cleanup = () => {
        this.off("joined", onSuccess);
        this.off("joinError", onError);
        this.off("authError", onError);
        this.off("socketError", onError);
      };
      this.on("joined", onSuccess);
      this.on("joinError", onError);
      this.on("authError", onError);
      this.on("socketError", onError);
    });
  });
  disconnect = vi.fn(() => {
    this.simulateDisconnected();
  });
  replaceTrack = vi.fn(async (trackId: string, newTrack: MediaStreamTrack | null) => {
    const ctx = this.localPeer?.tracks.get(trackId) as FakeTrackContext | undefined;
    if (ctx) ctx.track = newTrack;
    this.emit("localTrackReplaced", { trackId, track: newTrack });
  });
  removeTrack = vi.fn(async (trackId: string) => {
    this.localPeer?.tracks.delete(trackId);
    this.emit("localTrackRemoved", { trackId });
  });
  updateTrackMetadata = vi.fn((trackId: string, metadata: TrackMetadata) => {
    const ctx = this.localPeer?.tracks.get(trackId) as FakeTrackContext | undefined;
    if (ctx) ctx.metadata = metadata;
    this.emit("localTrackMetadataChanged", { trackId, metadata });
  });
  updatePeerMetadata = vi.fn((metadata: unknown) => {
    if (this.localPeer) this.localPeer.metadata = { peer: metadata, server: {} } as Peer["metadata"];
    this.emit("localPeerMetadataChanged", { metadata });
  });
  setTargetTrackEncoding = vi.fn((_trackId: string, _variant: Variant) => {});
  createDataChannels = vi.fn(async () => {
    this.dataChannelsReady = true;
    this.emit("dataChannelsReady");
  });
  publishData = vi.fn((_data: Uint8Array, _options: DataChannelOptions) => {});
  subscribeData = vi.fn((cb: DataCallback, _options: DataChannelOptions) => {
    this.dataSubscribers.add(cb);
    return () => this.dataSubscribers.delete(cb);
  });
  getStatistics = vi.fn(async () => ({}) as RTCStatsReport);

  // ---- addTrack: controllable to exercise races with in-flight publishes ----
  addTrack = vi.fn((track: MediaStreamTrack, metadata?: TrackMetadata): Promise<string> => {
    // Faithful to the real addTrack, which throws TrackTypeError SYNCHRONOUSLY
    // (not via a rejected promise) when a non-audio track is added to an
    // audio-only room (FishjamClient.ts: `if (this.isAudioOnlyConnection && ...)`).
    if (this.audioOnlyConnection && track.kind !== "audio") throw new TrackTypeError();
    const remoteId = `remote-${this.trackIdCounter++}`;
    const register = () => {
      if (!this.localPeer) this.localPeer = buildPeer({ id: "local-peer" });
      (this.localPeer.tracks as Map<string, unknown>).set(
        remoteId,
        new FakeTrackContext(remoteId, track, metadata, new FakeMediaStream([track])),
      );
      this.emit("localTrackAdded");
    };
    if (this.autoResolveAddTrack) {
      register();
      return Promise.resolve(remoteId);
    }
    const deferred = new Deferred<string>();
    this.pendingAddTracks.push(() => {
      register();
      deferred.resolve(remoteId);
    });
    return deferred.promise;
  });

  private trackIdCounter = 0;
  private autoResolveAddTrack = true;
  private pendingAddTracks: (() => void)[] = [];
  private dataChannelsReady = false;
  private dataSubscribers = new Set<DataCallback>();
  private reconnecting = false;
  private audioOnlyConnection = false;

  localPeer: Peer | null = null;
  remotePeers: Record<string, Peer> = {};

  // ---- read methods ----------------------------------------------------
  getLocalPeer = () => this.localPeer;
  getRemotePeers = () => this.remotePeers;
  getRemoteComponents = () => ({});
  isReconnecting = () => this.reconnecting;
  getDataChannelsReadiness = () => this.dataChannelsReady;
  getLocalTrackAudioLevel = async (_trackId: string) => null;

  // EventEmitter compat: the SDK calls removeListener (alias of off).

  asClient(): FishjamClient {
    // Drift tripwire: `this` must satisfy the real client's used surface
    // (see FishjamClientContract). If FishjamClient renames/re-signs/removes any
    // method the SDK relies on, this `satisfies` check stops compiling — the fake
    // can never silently go out of sync. The final `as unknown` only erases the
    // unused remainder of the (large, partly-private) FishjamClient surface.
    return this satisfies FishjamClientContract as unknown as FishjamClient;
  }

  // ---- test controls ---------------------------------------------------

  /** Hold addTrack promises until `flushAddTracks()`, so tests can race other ops against an in-flight publish. */
  deferAddTracks() {
    this.autoResolveAddTrack = false;
  }
  flushAddTracks() {
    const pending = this.pendingAddTracks;
    this.pendingAddTracks = [];
    pending.forEach((resolve) => resolve());
  }

  /** Marks the room audio-only, like an `authenticated` response with roomType AUDIO_ONLY does. */
  simulateAudioOnlyRoom() {
    this.audioOnlyConnection = true;
  }

  setLocalPeer(init: FakePeerInit) {
    this.localPeer = buildPeer(init);
    // `joined` is the real event that first surfaces the local peer; emitting it
    // invalidates useFishjamClientState's snapshot the same way production does.
    this.emit("joined");
  }
  addRemotePeer(init: FakePeerInit) {
    this.remotePeers[init.id] = buildPeer(init);
    this.emit("peerJoined", this.remotePeers[init.id]);
  }
  getRemoteTrackContext(peerId: string, trackId: string) {
    return this.remotePeers[peerId]?.tracks.get(trackId) as FakeTrackContext | undefined;
  }

  simulateConnectionStarted() {
    this.emit("connectionStarted");
  }
  simulateJoined() {
    // You cannot be joined without having connected, so status must already be
    // `initialized` here (connect() sets it; this covers tests that jump
    // straight to the joined state without awaiting connect()).
    this.status = "initialized";
    if (!this.localPeer) this.localPeer = buildPeer({ id: "local-peer" });
    this.emit("joined");
  }
  simulateReconnectionStarted() {
    this.reconnecting = true;
    this.emit("reconnectionStarted");
  }
  simulateReconnected() {
    this.reconnecting = false;
    this.emit("reconnected");
  }
  simulateReconnectionRetriesLimitReached() {
    this.emit("reconnectionRetriesLimitReached");
  }
  simulateAuthError() {
    this.emit("authError");
  }
  simulateJoinError() {
    this.emit("joinError");
  }
  simulateConnectionError() {
    this.emit("connectionError");
  }
  simulateDisconnected() {
    this.localPeer = null;
    this.remotePeers = {};
    this.dataChannelsReady = false;
    this.emit("disconnected");
  }
  simulateDataChannelsError(error: Error) {
    this.emit("dataChannelsError", error);
  }
  simulateIncomingData(data: Uint8Array) {
    this.dataSubscribers.forEach((cb) => cb(data));
  }
}
