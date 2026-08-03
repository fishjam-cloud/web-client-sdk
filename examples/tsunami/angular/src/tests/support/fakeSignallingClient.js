import { EventEmitter } from "events";
import { vi } from "vitest";
import { FakeMediaStream } from "./fakeMediaStream";
/** In-memory track context mirroring the slice of `FishjamTrackContext` the SDK reads. */
export class FakeTrackContext extends EventEmitter {
    trackId;
    track;
    metadata;
    stream;
    constructor(trackId, track, metadata, stream) {
        super();
        this.trackId = trackId;
        this.track = track;
        this.metadata = metadata;
        this.stream = stream;
    }
}
const buildPeer = (init) => {
    const tracks = new Map();
    for (const trackInit of init.tracks ?? []) {
        tracks.set(trackInit.trackId, new FakeTrackContext(trackInit.trackId, trackInit.track ?? null, trackInit.metadata, new FakeMediaStream(trackInit.track ? [trackInit.track] : [])));
    }
    return {
        id: init.id,
        type: "webrtc",
        metadata: init.metadata,
        // FakeTrackContext implements only the read surface of FishjamTrackContext;
        // this cast erases the unimplemented remainder.
        tracks: tracks,
    };
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
    status = "new";
    localPeer = null;
    remotePeers = {};
    trackIdCounter = 0;
    reconnecting = false;
    // ---- spies (assert call args / counts) -------------------------------
    // Faithful to the real connect(): emits `connectionStarted`, flips status to
    // `initialized`, and only resolves once `joined` fires (rejects on
    // join/auth/socket errors). A test that awaits connect() must drive
    // `simulateJoined()` for the await to settle.
    connect = vi.fn((_config) => {
        this.emit("connectionStarted");
        this.status = "initialized";
        return new Promise((resolve, reject) => {
            const errorEvents = ["joinError", "authError", "socketError"];
            const onSuccess = () => {
                cleanupListeners();
                resolve();
            };
            const errorHandlers = errorEvents.map((event) => {
                const handler = () => {
                    cleanupListeners();
                    reject(new Error(`FakeSignallingClient: "${event}" emitted while connect() was pending`));
                };
                return [event, handler];
            });
            const cleanupListeners = () => {
                this.off("joined", onSuccess);
                for (const [event, handler] of errorHandlers)
                    this.off(event, handler);
            };
            this.on("joined", onSuccess);
            for (const [event, handler] of errorHandlers)
                this.on(event, handler);
        });
    });
    disconnect = vi.fn(() => {
        this.simulateDisconnected();
    });
    cleanup = vi.fn();
    addTrack = vi.fn((track, metadata, _simulcastConfig, _maxBandwidth) => {
        const remoteTrackId = `remote-${this.trackIdCounter++}`;
        if (!this.localPeer)
            this.localPeer = buildPeer({ id: "local-peer" });
        this.localPeer.tracks.set(remoteTrackId, new FakeTrackContext(remoteTrackId, track, metadata, new FakeMediaStream([track])));
        this.emit("localTrackAdded");
        return Promise.resolve(remoteTrackId);
    });
    replaceTrack = vi.fn(async (trackId, newTrack) => {
        const context = this.localPeer?.tracks?.get(trackId);
        if (context)
            context.track = newTrack;
        this.emit("localTrackReplaced", { trackId, track: newTrack });
    });
    removeTrack = vi.fn(async (trackId) => {
        this.localPeer?.tracks?.delete(trackId);
        this.emit("localTrackRemoved", { trackId });
    });
    updateTrackMetadata = vi.fn((trackId, metadata) => {
        const context = this.localPeer?.tracks?.get(trackId);
        if (context)
            context.metadata = metadata;
        this.emit("localTrackMetadataChanged", { trackId, metadata });
    });
    // ---- read methods ----------------------------------------------------
    getLocalPeer = () => this.localPeer;
    getRemotePeers = () => this.remotePeers;
    getRemoteComponents = () => ({});
    getRemoteTracks = () => ({});
    isReconnecting = () => this.reconnecting;
    asClient() {
        // Drift tripwire: `this` must satisfy the surface tsunami uses (see
        // SignallingClientContract). The final `as unknown` only erases the unused
        // remainder of the (large, partly-private) ts-client surface.
        return this;
    }
    // ---- test controls ---------------------------------------------------
    addRemotePeer(init) {
        this.remotePeers[init.id] = buildPeer(init);
        this.emit("peerJoined", this.remotePeers[init.id]);
    }
    removeRemotePeer(peerId) {
        const peer = this.remotePeers[peerId];
        delete this.remotePeers[peerId];
        this.emit("peerLeft", peer);
    }
    simulateConnectionStarted() {
        this.emit("connectionStarted");
    }
    simulateJoined() {
        // You cannot be joined without having connected, so status must already be
        // `initialized` here (connect() sets it; this covers tests that jump
        // straight to the joined state without awaiting connect()).
        this.status = "initialized";
        if (!this.localPeer)
            this.localPeer = buildPeer({ id: "local-peer" });
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
        this.emit("disconnected");
    }
}
