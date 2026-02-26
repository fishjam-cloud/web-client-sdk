# SDK Refactor Migration Plan: TS Client as Core Logic Layer

## Table of Contents
1. [Current Architecture Analysis](#1-current-architecture-analysis)
2. [Proposed Interfaces](#2-proposed-interfaces)
3. [What Moves Where](#3-what-moves-where)
4. [Risk Areas](#4-risk-areas)
5. [Sequenced Migration Plan](#5-sequenced-migration-plan)
6. [Breaking Changes & Mitigation](#6-breaking-changes--mitigation)

---

## 1. Current Architecture Analysis

### 1.1 Package Overview

```
packages/
├── ts-client         Signalling layer: WebSocket + WebRTC via WebRTCEndpoint
├── react-client      Full-featured SDK: device mgmt + track lifecycle + React hooks
├── mobile-client     Thin wrapper around react-client with RN polyfills
├── webrtc-client     Low-level WebRTCEndpoint / RTCPeerConnection abstraction
└── protobufs         Protobuf message definitions
```

### 1.2 TS Client (`packages/ts-client`)

**Responsibility today:** Signalling only. Wraps `WebRTCEndpoint` (from `webrtc-client`) and a WebSocket connection. Has no knowledge of devices, getUserMedia, or UI state.

**Public methods:**
| Method | Purpose |
|--------|---------|
| `connect(config)` | Open WebSocket + authenticate |
| `disconnect()` / `leave()` | Close connection |
| `addTrack(track, metadata, simulcast, bandwidth)` | Register and send a `MediaStreamTrack` |
| `replaceTrack(trackId, newTrack \| null)` | Swap track (null = pause) |
| `removeTrack(trackId)` | Stop sending a track |
| `setTrackBandwidth(trackId, bw)` | Set bitrate limit |
| `setEncodingBandwidth(trackId, rid, bw)` | Per-variant bitrate |
| `enableTrackEncoding(trackId, variant)` | Enable simulcast layer |
| `disableTrackEncoding(trackId, variant)` | Disable simulcast layer |
| `setTargetTrackEncoding(trackId, variant)` | Request preferred layer from remote |
| `updatePeerMetadata(meta)` | Broadcast self metadata change |
| `updateTrackMetadata(trackId, meta)` | Broadcast track metadata change |
| `getRemoteTracks()` | Snapshot of remote track contexts |
| `getRemotePeers()` | Snapshot of remote peers |
| `getRemoteComponents()` | Snapshot of server components |
| `getLocalPeer()` | Local peer snapshot |
| `getBandwidthEstimation()` | Current bitrate estimate |
| `getStatistics(selector?)` | RTCStatsReport |
| `createDataChannels()` | Open data channel endpoints |
| `publishData(data, options)` | Send data channel message |
| `subscribeData(cb, options)` | Receive data channel messages |

**Events emitted (grouped):**
```
Connection:    connectionStarted, socketOpen, socketClose, socketError,
               authSuccess, authError, disconnected, connectionError
Reconnection:  reconnectionStarted, reconnected, reconnectionRetriesLimitReached
Room:          joined, joinError
Peers:         peerJoined, peerLeft, peerUpdated
Components:    componentAdded, componentRemoved, componentUpdated
Remote tracks: trackAdded, trackReady, trackRemoved, trackUpdated,
               tracksPriorityChanged, targetTrackEncodingRequested,
               bandwidthEstimationChanged
Local tracks:  localTrackAdded, localTrackRemoved, localTrackReplaced,
               localTrackMuted, localTrackUnmuted, localTrackBandwidthSet,
               localTrackEncodingBandwidthSet, localTrackEncodingEnabled,
               localTrackEncodingDisabled, localPeerMetadataChanged,
               localTrackMetadataChanged, disconnectRequested
Data:          dataChannelsReady, dataChannelsError
```

**State management:** None. All getters (`getRemoteTracks()`, etc.) read from the underlying `WebRTCEndpoint` synchronously. No store, no subscribe mechanism.

**Constructor config:**
```typescript
{ debug?: boolean; clientType?: 'web' | 'mobile'; reconnect?: ReconnectConfig | boolean }
```

---

### 1.2 React Client (`packages/react-client`)

**Responsibility today:** Everything above the signalling layer:
- Device enumeration and selection (`useMediaDevices`, `useDeviceManager`)
- `getUserMedia` / `getDisplayMedia` calls
- Track lifecycle management (add, replace, pause, resume, mute)
- Track middleware pipeline (arbitrary transforms)
- Screen share lifecycle
- Custom source registration
- Connection status tracking
- All state exposed as React context
- `useSyncExternalStore` bridge from TS client events to React state

**Architecture inside react-client:**

```
FishjamProvider
├── Creates FishjamClient instance
├── useFishjamClientState → subscribes to ~35 TS client events → React state
├── usePeerStatus → maps events to { idle | connecting | connected | error }
├── useMediaDevices (camera + microphone)
│   └── useDeviceManager × 2 (camera, mic)
│       └── useHandleTrackEnd (device disconnect detection)
├── useTrackManager × 2 (camera, mic)
│   └── Calls client.addTrack / replaceTrack / removeTrack
├── useScreenShareManager → getDisplayMedia → client.addTrack × 2
├── useCustomSourceManager → client.addTrack per sourceId
└── Various contexts exposing state/managers downward
```

**Key hooks and their logic:**

| Hook | Core Logic |
|------|-----------|
| `useConnection` | Wraps `client.connect()` / `client.disconnect()`, reads peer/reconnection status from context |
| `usePeers` | Reads `FishjamClientState`, enriches peers with typed track accessors |
| `useCamera` | Reads from `CameraContext`; exposes toggle/start/stop/select/middleware |
| `useMicrophone` | Reads from `MicrophoneContext`; adds mute/unmute on top of camera pattern |
| `useInitializeDevices` | Calls `initializeDevices()` from `InitDevicesContext` |
| `useScreenShare` | Reads from `ScreenshareContext`; wraps start/stop and middleware |
| `useCustomSource` | Reads from `CustomSourceContext`; wraps `setStream(id, stream)` |
| `useDataChannel` | Wraps `client.createDataChannels()`, `publishData`, `subscribeData` |
| `useStatistics` | Wraps `client.getStatistics()` |
| `useVAD` | Subscribes to `voiceActivityChanged` events on remote track contexts |
| `useUpdatePeerMetadata` | Wraps `client.updatePeerMetadata()` |
| `useLivestreamStreamer` | WHIP client lifecycle (independent RTCPeerConnection) |
| `useLivestreamViewer` | WHEP client lifecycle (independent RTCPeerConnection) |

**How the two packages are wired together today:**

1. `FishjamProvider` creates a `FishjamClient` ref.
2. `useFishjamClientState` subscribes via `useSyncExternalStore` to every relevant event on the client and produces an immutable snapshot `{ peers, components, localPeer, isReconnecting }`.
3. `useTrackManager` listens to `joined` / `disconnected` to know when to call `addTrack` / clean up track IDs.
4. `useScreenShareManager` and `useCustomSourceManager` similarly subscribe to lifecycle events.
5. All device operations ultimately call `client.addTrack()`, `client.replaceTrack()`, or `client.removeTrack()`.
6. The React layer holds all device state (`MediaStream`, `MediaStreamTrack`, device lists, errors, middleware state) — the TS client only knows about `MediaStreamTrack` references.

---

### 1.3 Mobile Client (`packages/mobile-client`)

**Responsibility today:** Thin wrapper around `react-client` that:
- Installs `react-native-webrtc` polyfills before any WebRTC code runs.
- Re-exports all hooks and types.
- Overrides `FishjamProvider` to pass `clientType: 'mobile'` and remove `persistLastDevice`.
- Adds RN-specific components: `RTCView`, `RTCPIPView`, `ScreenCapturePickerView`, `useForegroundService`.

The mobile client does **not** currently have its own device management — it relies on react-client's `navigator.mediaDevices` calls working through the react-native-webrtc polyfill.

---

## 2. Proposed Interfaces

### 2.1 `IDeviceManager`

This interface abstracts all platform-level media APIs. It is injected into `FishjamClient` at construction time.

```typescript
// packages/ts-client/src/devices/IDeviceManager.ts

export interface DeviceItem {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'videoinput' | 'audiooutput';
}

export interface DeviceError {
  name: 'NotAllowedError' | 'NotFoundError' | 'OverconstrainedError' | 'UNHANDLED_ERROR';
  message: string;
}

export interface IDeviceManager {
  /**
   * Return all currently available media input/output devices.
   * Equivalent to navigator.mediaDevices.enumerateDevices().
   */
  enumerateDevices(): Promise<DeviceItem[]>;

  /**
   * Acquire a media stream matching the given constraints.
   * Equivalent to navigator.mediaDevices.getUserMedia().
   */
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;

  /**
   * Acquire a display/screen capture stream.
   * Equivalent to navigator.mediaDevices.getDisplayMedia().
   * Optional — implementations may throw NotSupportedError on platforms
   * that do not support screen sharing (e.g. React Native).
   */
  getDisplayMedia(constraints?: DisplayMediaStreamConstraints): Promise<MediaStream>;

  /**
   * Subscribe to hardware device-change events.
   * Returns a cleanup function.
   * Equivalent to navigator.mediaDevices.addEventListener('devicechange', ...).
   */
  onDeviceChange(callback: () => void): () => void;

  /**
   * Optional: persist/restore the last selected device ID across page loads.
   * If omitted, last-device persistence is disabled.
   */
  persistence?: IDevicePersistence;
}

export interface IDevicePersistence {
  getLastDeviceId(kind: 'camera' | 'microphone'): string | null;
  setLastDeviceId(kind: 'camera' | 'microphone', deviceId: string): void;
}
```

**Web implementation** (lives in `react-client` or a new `web-device-manager` sub-package):

```typescript
export class WebDeviceManager implements IDeviceManager {
  // Thin wrappers around navigator.mediaDevices.*
  // Safari quirk correction (correctDevicesOnSafari) lives here
  // LocalStorage persistence via IDevicePersistence
}
```

**React Native implementation** (lives in `mobile-client`):

```typescript
export class ReactNativeDeviceManager implements IDeviceManager {
  // Wraps react-native-webrtc mediaDevices.*
  // getDisplayMedia → ScreenCapturePickerView flow
  // persistence → AsyncStorage or omitted
}
```

---

### 2.2 `IMediaTrack` and `IMediaStream`

Both the browser and react-native-webrtc expose `MediaStreamTrack` and `MediaStream` with compatible-enough shapes. Rather than defining our own full interface, we use **structural compatibility** — the internal ts-client code accepts `MediaStreamTrack`-shaped objects, and the polyfill satisfies that shape at runtime.

For the ts-client's internal type boundary we define minimal read-only interfaces used in `ClientState`:

```typescript
// packages/ts-client/src/media/IMediaTrack.ts

export interface IMediaTrack {
  readonly id: string;
  readonly kind: 'audio' | 'video';
  readonly label: string;
  enabled: boolean;
  readonly readyState: 'live' | 'ended';
  addEventListener(type: 'ended', listener: () => void): void;
  removeEventListener(type: 'ended', listener: () => void): void;
  stop(): void;
  // Implementations may be MediaStreamTrack (browser) or RNMediaStreamTrack (RN polyfill)
}

export interface IMediaStream {
  readonly id: string;
  getTracks(): IMediaTrack[];
  getVideoTracks(): IMediaTrack[];
  getAudioTracks(): IMediaTrack[];
  addTrack(track: IMediaTrack): void;
  removeTrack(track: IMediaTrack): void;
}
```

The existing `FishjamClient` API surface already accepts `MediaStreamTrack` — no immediate change needed there. These interfaces are primarily useful for typing `ClientState` in a platform-neutral way.

---

### 2.3 `ClientState`

This is the flat, serialisable shape that `getState()` returns and that `subscribe()` listeners observe.

```typescript
// packages/ts-client/src/state/ClientState.ts

export type PeerStatus = 'idle' | 'connecting' | 'connected' | 'error';
export type ReconnectionStatus = 'idle' | 'reconnecting' | 'reconnected' | 'limit_reached';

export interface LocalDeviceState {
  /** The raw track as obtained from getUserMedia (before middleware) */
  rawTrack: IMediaTrack | null;
  /** The track actually being sent to remote peers (after middleware) */
  streamingTrack: IMediaTrack | null;
  /** Track ID registered in FishjamClient, or null if not streaming */
  fishjamTrackId: string | null;
  /** Whether the device is active (user intent = on) */
  enabled: boolean;
  /** Whether the track is muted (paused without stopping the device) */
  muted: boolean;
  /** Currently selected device */
  selectedDevice: DeviceItem | null;
}

export interface ScreenShareState {
  videoTrack: IMediaTrack | null;
  audioTrack: IMediaTrack | null;
  videoFishjamTrackId: string | null;
  audioFishjamTrackId: string | null;
  active: boolean;
}

export interface CustomSourceState {
  stream: IMediaStream | null;
  videoFishjamTrackId: string | null;
  audioFishjamTrackId: string | null;
}

export interface ClientState<PeerMetadata = unknown, ServerMetadata = unknown> {
  // ── Connection ────────────────────────────────────────────────────────────
  peerStatus: PeerStatus;
  reconnectionStatus: ReconnectionStatus;

  // ── Session participants ──────────────────────────────────────────────────
  localPeer: Peer<PeerMetadata, ServerMetadata> | null;
  remotePeers: Record<string, Peer<PeerMetadata, ServerMetadata>>;
  components: Record<string, Component>;

  // ── Local devices ─────────────────────────────────────────────────────────
  camera: LocalDeviceState;
  microphone: LocalDeviceState;
  screenShare: ScreenShareState;
  customSources: Record<string, CustomSourceState>;

  // ── Available devices ─────────────────────────────────────────────────────
  availableCameras: DeviceItem[];
  availableMicrophones: DeviceItem[];
  cameraError: DeviceError | null;
  microphoneError: DeviceError | null;
  devicesInitialized: boolean;

  // ── Network ───────────────────────────────────────────────────────────────
  bandwidthEstimation: bigint;

  // ── Data channels ─────────────────────────────────────────────────────────
  dataChannelReady: boolean;
  dataChannelError: Error | null;
}
```

Design notes:
- The state is intentionally flat to make `useSyncExternalStore` snapshotting cheap.
- `IMediaTrack` references are included but the rest is serialisable primitives — this allows future SSR/hydration scenarios.
- `customSources` is a `Record` keyed by `sourceId` to allow multiple simultaneous custom sources.
- Generics are limited to `PeerMetadata` / `ServerMetadata` — `TrackMetadata` is defined by consumers and should not leak into the top-level state shape (it lives inside `FishjamTrackContext`).

---

### 2.4 Upgraded `FishjamClient` Public Surface

```typescript
// packages/ts-client/src/FishjamClient.ts  (additions)

class FishjamClient<PeerMetadata, ServerMetadata> extends TypedEventEmitter<MessageEvents> {

  // ── Constructor (new optional params) ─────────────────────────────────────
  constructor(config?: {
    debug?: boolean;
    clientType?: 'web' | 'mobile';
    reconnect?: ReconnectConfig | boolean;
    /**
     * Platform-specific device manager.
     * Defaults to WebDeviceManager if running in a browser environment.
     * Pass null to disable all device management (signalling-only mode).
     */
    deviceManager?: IDeviceManager | null;
    /**
     * Default constraints used for camera/microphone getUserMedia calls.
     */
    defaultConstraints?: { audio?: MediaTrackConstraints | boolean; video?: MediaTrackConstraints | boolean };
    /**
     * Simulcast/bandwidth configuration for camera and microphone tracks.
     */
    videoConfig?: StreamConfig;
    audioConfig?: StreamConfig;
    bandwidthLimits?: Partial<BandwidthLimits>;
  });

  // ── Store interface ───────────────────────────────────────────────────────
  /** Return a snapshot of current state. Safe to call from any context. */
  getState(): ClientState<PeerMetadata, ServerMetadata>;

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;

  // ── Device initialisation ─────────────────────────────────────────────────
  initializeDevices(settings?: {
    enableVideo?: boolean;
    enableAudio?: boolean;
  }): Promise<InitializeDevicesResult>;

  // ── Camera ────────────────────────────────────────────────────────────────
  startCamera(deviceId?: string): Promise<void>;
  stopCamera(): void;
  toggleCamera(): Promise<void>;
  selectCamera(deviceId: string): Promise<void>;
  setCameraTrackMiddleware(middleware: TrackMiddleware | null): Promise<void>;

  // ── Microphone ────────────────────────────────────────────────────────────
  startMicrophone(deviceId?: string): Promise<void>;
  stopMicrophone(): void;
  toggleMicrophone(): Promise<void>;
  selectMicrophone(deviceId: string): Promise<void>;
  toggleMicrophoneMute(): Promise<void>;
  setMicrophoneTrackMiddleware(middleware: TrackMiddleware | null): Promise<void>;

  // ── Screen share ──────────────────────────────────────────────────────────
  startScreenShare(constraints?: {
    audio?: boolean | MediaTrackConstraints;
    video?: boolean | MediaTrackConstraints;
  }): Promise<void>;
  stopScreenShare(): void;
  setScreenShareTracksMiddleware(middleware: TracksMiddleware | null): Promise<void>;

  // ── Custom sources ────────────────────────────────────────────────────────
  setCustomSource(sourceId: string, stream: IMediaStream | null): Promise<void>;

  // ── All existing methods remain unchanged ─────────────────────────────────
  connect<PeerMetadata>(config: ConnectConfig<PeerMetadata>): Promise<void>;
  disconnect(): void;
  addTrack(...): Promise<string>;
  replaceTrack(...): Promise<void>;
  // ... etc.
}
```

---

## 3. What Moves Where

### Category A — Moves to TS Client Core

| Current Location | Logic | Notes |
|-----------------|-------|-------|
| `useFishjamClientState` | Event-driven state accumulation (peers, components, localPeer) | Becomes the internal store that `getState()` returns |
| `usePeerStatus` | Mapping client events → `PeerStatus` enum | Becomes part of `ClientState.peerStatus` |
| `useReconnection` | Mapping reconnect events → `ReconnectionStatus` | Becomes `ClientState.reconnectionStatus` |
| `useTrackManager` | Track ID bookkeeping, `addTrack`/`replaceTrack`/`removeTrack` orchestration, pause/resume, middleware application | Becomes `TrackManager` class inside ts-client |
| `useScreenShareManager` | `getDisplayMedia`, track add/remove, middleware application | Becomes `ScreenShareManager` class inside ts-client |
| `useCustomSourceManager` | Custom stream registration, pending-sources queue | Becomes `CustomSourceManager` class inside ts-client |
| `useDeviceManager` (state) | `deviceEnabled`, `deviceTrack`, `deviceList`, `activeDevice`, `deviceError` | Becomes device state fields in `ClientState.camera` / `.microphone` |
| `useHandleTrackEnd` | Listen for `track.onended`, trigger device restart or state update | Becomes an internal listener attached during device start |
| `useRetryHelper` | setTimeout-based retry for device start | Becomes plain `setTimeout` in the internal manager class |
| `mediaInitializer.ts` | `initializeDevices` logic: getUserMedia + enumerateDevices + error handling | Becomes `DeviceManager.initialize()` inside ts-client, delegating to `IDeviceManager` |
| `devices/constraints.ts` | Default video/audio constraints | Moves as-is into ts-client |
| `utils/localStorage.ts` | Last-device persistence helpers | Moves into `IDevicePersistence` (injected via `IDeviceManager`) |
| `utils/bandwidth.ts` | Bandwidth limit merging | Moves into ts-client utilities |
| `utils/track.ts` | Track helper utilities | Moves into ts-client utilities |

### Category B — Becomes IDeviceManager Implementation

| Current Location | Logic | Notes |
|-----------------|-------|-------|
| `useMediaDevices` — `getUserMedia` call | Actual browser API invocation | `WebDeviceManager.getUserMedia()` |
| `useMediaDevices` — `enumerateDevices` call | Device list retrieval | `WebDeviceManager.enumerateDevices()` |
| `useMediaDevices` — `correctDevicesOnSafari` | Safari label quirk correction | `WebDeviceManager.enumerateDevices()` implementation detail |
| `useMediaDevices` — `devicechange` listener | Hardware device hotplug | `WebDeviceManager.onDeviceChange()` |
| `useDeviceManager` — `selectDevice` → `getUserMedia` | Re-acquire stream on device switch | `WebDeviceManager.getUserMedia()` called by `DeviceManager.selectDevice()` |
| `utils/localStorage.ts` | Last-device read/write | `LocalStorageDevicePersistence implements IDevicePersistence` |
| `getDisplayMedia` call (in `useScreenShareManager`) | Screen capture acquisition | `WebDeviceManager.getDisplayMedia()` |

### Category C — Stays in React SDK (thin adapters)

| Hook / Component | Stays Because |
|-----------------|---------------|
| `FishjamProvider` | React context tree setup; still needed as an entry point |
| All public hooks (`useCamera`, `useMicrophone`, etc.) | React-specific API surface; become thin wrappers over `client.*` methods and `client.getState()` |
| `useSyncExternalStore` wiring in `useFishjamClientState` | React 18-specific API; wraps `client.subscribe()` |
| `useConnection` | Thin wrapper over `client.connect()` / `client.disconnect()` |
| `usePeers` | Transforms `ClientState.remotePeers` into `PeerWithTracks[]` with typed track accessors |
| `useVAD` | Subscribes to `FishjamTrackContext.voiceActivityChanged` — this is inherently event-per-track, not store state |
| `useDataChannel` | Thin wrapper; no logic to move |
| `useStatistics` | Thin wrapper; no logic to move |
| `useUpdatePeerMetadata` | Thin wrapper |
| `useSandbox` | Dev-only; React-specific |
| `useLivestreamStreamer` / `useLivestreamViewer` | Independent WHIP/WHEP RTCPeerConnection; unrelated to main client lifecycle |

---

## 4. Risk Areas

### R1 — Three-Way Track State Separation

**Description:** The current implementation separates track state into three layers:
1. **Device layer** — the raw `MediaStreamTrack` from `getUserMedia`, owned by `useDeviceManager`
2. **Middleware layer** — the transformed track (e.g. canvas effect applied), computed by `useTrackManager`
3. **Streaming layer** — the track ID registered in `FishjamClient` via `addTrack`

These three layers must remain in sync across: device starts, device switches, middleware changes, mute/unmute, and reconnection. Currently this is enforced by React hook call chains. Moving this into a plain class requires explicit state machine design and careful async coordination.

**Mitigation:** Design an internal `LocalTrackController` class with well-defined state transitions (an FSM with states: `idle → starting → active → paused → switching → stopping`). Write unit tests for each transition before migrating any React hook.

---

### R2 — Async Middleware Pipeline

**Description:** `TrackMiddleware` can be async and returns a new `MediaStreamTrack`. Changing middleware after a track is already streaming requires:
1. Apply new middleware to the current device track.
2. Call `client.replaceTrack(fishjamTrackId, newTransformedTrack)`.
3. Stop the old transformed track if it was created by the previous middleware.

The current `applyMiddleware()` in `useDeviceManager` handles this, but it runs inside a React `useCallback` and captures stale closure refs if not careful. Moving to a class makes this easier (no stale closures), but the async sequencing must be correct.

**Mitigation:** Use a promise queue (or mutex) inside `LocalTrackController` to serialise middleware changes and device switches.

---

### R3 — Reconnection Track Re-Add

**Description:** When `reconnected` fires, currently `useTrackManager` checks if a track was streaming before the disconnect and calls `addTrack` again (if `addTracksOnReconnect` is set). The track IDs change between connections.

This logic is currently scattered: the React hook observes `joined` / `reconnected` / `disconnected` events and manages a `fishjamTrackId` ref. Moving this into the TS client is conceptually clean but must not break the `addTracksOnReconnect: false` case where the application decides what to re-add.

**Mitigation:** Keep `addTracksOnReconnect` as a config flag in `FishjamClient`. When true, the internal `LocalTrackController` automatically re-registers any track that was streaming before disconnection. When false, the application is expected to call `startCamera()` / `startMicrophone()` again after `reconnected`.

---

### R4 — Pending Tracks Before Connection

**Description:** The current `useCustomSourceManager` handles the case where `setCustomSource()` is called before `joined` fires. It queues the stream and flushes it on `joined`.

The camera and microphone also face this: `startCamera()` might be called before `connect()`. Currently `useTrackManager` holds the device track in React state and only calls `addTrack` when `peerStatus === 'connected'`.

This pending-stream pattern must be reproduced in the TS client's internal managers.

**Mitigation:** Each internal manager (`CameraManager`, `MicrophoneManager`, etc.) maintains a `pendingAdd` flag. On `joined`, the managers iterate pending tracks and call `addTrack`. This is equivalent to the current React hook pattern.

---

### R5 — Device Disconnect / Track End Handling

**Description:** `useHandleTrackEnd` sets `track.onended = () => { ... }` to detect when a camera or microphone is physically unplugged. On track end it:
1. Clears the device track state.
2. Possibly calls `removeTrack` to stop sending to remote peers.
3. Updates device error state.

The equivalent in a class is straightforward (`track.addEventListener('ended', ...)`), but the interaction with the `IDeviceManager.onDeviceChange` callback (which fires when new devices appear) must not cause double-handling.

**Mitigation:** Distinguish `track.ended` (device physically removed) from `devicechange` (device list changed). The former clears the current track state; the latter only re-enumerates available devices.

---

### R6 — Safari MediaDevices Quirks

**Description:** `correctDevicesOnSafari` in `useMediaDevices` re-runs `getUserMedia` with minimal constraints after a permissions grant to get populated device labels (Safari returns empty labels before first `getUserMedia`). This is a browser-specific workaround.

**Mitigation:** This logic moves cleanly into `WebDeviceManager.enumerateDevices()`. It is entirely invisible to the TS client core.

---

### R7 — `FishjamTrackContext` as EventEmitter

**Description:** Remote `FishjamTrackContext` objects are TypedEventEmitters that emit `encodingChanged` and `voiceActivityChanged`. The `useVAD` hook subscribes to these per-track events directly. This is not store-based state — it's a push event per track object.

If we surface VAD state through `ClientState`, every speech/silence change would trigger a full re-render of all subscribers. This is undesirable.

**Mitigation:** Keep `FishjamTrackContext` as an EventEmitter. `useVAD` stays in the React layer, subscribing directly. Optionally, add `vadStatus` to `ClientState` as a `Record<trackId, VadStatus>` snapshot, but only update it on changes (not on every audio frame).

---

### R8 — Generic Typing of ClientState

**Description:** `FishjamClient` is generic over `PeerMetadata` and `ServerMetadata`. `ClientState` must carry these generics. React's `useSyncExternalStore` requires `getSnapshot` to return a referentially stable value when nothing has changed — the generic store makes it harder to create typed context without `any` casts.

**Mitigation:** Use a lightweight generic context approach in React:
```typescript
const FishjamContext = createContext<FishjamClient<any, any> | null>(null);
// Typed hook factory:
function useFishjamClient<P, S>() {
  return useContext(FishjamContext) as FishjamClient<P, S>;
}
```
This is the same pattern used today for `FishjamClientContext`.

---

### R9 — `persistLastDevice` Removal on Mobile

**Description:** The mobile client currently disables `persistLastDevice` entirely (no `localStorage` in RN). With `IDeviceManager`, this is handled naturally: `ReactNativeDeviceManager` simply doesn't implement `IDevicePersistence`. However, the `FishjamProvider` props currently expose `persistLastDevice` — we need to ensure removing it from the mobile provider doesn't break existing consumers.

**Mitigation:** `persistLastDevice` prop on `FishjamProvider` maps to an optional `IDevicePersistence` passed to the device manager. Mobile provider never passes it. Web provider passes `LocalStorageDevicePersistence` by default.

---

### R10 — Livestream Hooks

**Description:** `useLivestreamStreamer` and `useLivestreamViewer` manage independent `RTCPeerConnection` instances (WHIP/WHEP) with their own lifecycles. They are currently in `react-client` but are conceptually unrelated to the main session.

**Recommendation:** Leave these as-is in the React layer for now. They can be migrated to TS client in a separate, later effort. Their API surface is stable and not blocking the core refactor.

---

## 5. Sequenced Migration Plan

Each step is designed to be independently releasable and non-breaking to external consumers unless explicitly noted.

---

### Step 1 — Add `getState()` / `subscribe()` to TS Client

**What changes:**
- Add an internal state object to `FishjamClient` that mirrors what `useFishjamClientState` computes today: `{ peers, components, localPeer, isReconnecting, peerStatus }`.
- Subscribe to the same ~35 events internally; update state on each.
- Expose `getState(): ClientState` and `subscribe(listener: () => void): () => void`.
- `peerStatus` and `reconnectionStatus` are added to `ClientState` (previously only in React context).

**TS client after:** Has a live internal state store. `getState()` and `subscribe()` are public.

**React SDK after:** No change yet. `useFishjamClientState` continues to work exactly as before by subscribing to individual events.

**Validation:**
- Unit test: subscribe to client, trigger events, assert `getState()` snapshots change.
- Integration test: mount existing React app with no changes — all hooks behave identically.
- Optionally: add an internal test mode where React SDK uses `client.subscribe()` instead of individual event subscriptions, and verify parity.

---

### Step 2 — Define IDeviceManager and WebDeviceManager

**What changes:**
- Add `IDeviceManager` and `IDevicePersistence` interfaces to ts-client (exported for implementors).
- Add `IMediaTrack` and `IMediaStream` minimal interfaces.
- Implement `WebDeviceManager` in react-client (or a new `packages/browser-device-manager`).
- Accept optional `deviceManager` in `FishjamClient` constructor. If omitted, behaviour is unchanged.
- No device logic actually moves yet.

**TS client after:** Knows about `IDeviceManager` interface; accepts but ignores it.

**React SDK after:** `WebDeviceManager` implemented but not yet wired in.

**Validation:**
- TypeScript compilation passes.
- `WebDeviceManager` unit tests: `getUserMedia`, `enumerateDevices`, `onDeviceChange`, persistence.
- Safari quirk correction tested in `WebDeviceManager`.

---

### Step 3 — Move Device Initialisation into TS Client

**What changes:**
- Add `DeviceOrchestrator` class inside ts-client that holds:
  - A `CameraController` and `MicrophoneController` (manage device track state, middleware, pending-add queue).
  - Delegates to `IDeviceManager` for all media API calls.
- `FishjamClient` creates a `DeviceOrchestrator` if `deviceManager` is provided (non-null).
- Expose on `FishjamClient`: `initializeDevices()`, `startCamera()`, `stopCamera()`, `toggleCamera()`, `selectCamera()`, `setCameraTrackMiddleware()`, and microphone equivalents.
- `ClientState` is extended with `camera`, `microphone`, `availableCameras`, `availableMicrophones`, `cameraError`, `microphoneError`, `devicesInitialized`.

**React SDK after:**
- `FishjamProvider` passes a `WebDeviceManager` into `FishjamClient` constructor.
- `useMediaDevices` / `useDeviceManager` hooks are kept but delegate to `client.initializeDevices()` / `client.startCamera()` etc.
- State is read from `client.getState()` via `useSyncExternalStore`.
- Old internal hooks (`useTrackManager`, `useDeviceManager`) are kept as thin shims during transition.

**Validation:**
- All existing camera/microphone tests pass.
- Device initialization returns same results as before.
- `client.getState().camera` reflects correct state after `startCamera()`.
- `client.getState().availableCameras` populated after `initializeDevices()`.

---

### Step 4 — Move Track Lifecycle into TS Client

**What changes:**
- `CameraController` and `MicrophoneController` now handle the full track lifecycle: `getUserMedia` → middleware → `client.addTrack()` → `client.replaceTrack()` → `client.removeTrack()`.
- Implement pending-track logic: if `startCamera()` is called before `joined`, store intent and flush on `joined`.
- Implement reconnection re-add: on `reconnected`, re-add tracks that were streaming before disconnect.
- `useTrackManager` in React SDK is replaced with direct calls to `client.startCamera()` etc.

**React SDK after:**
- `useCamera()` and `useMicrophone()` read state from `client.getState()` and call `client.*Camera()` / `client.*Microphone()`.
- `useTrackManager`, `useDeviceManager` internal hooks are deleted.
- `CameraContext` and `MicrophoneContext` are simplified or removed; direct `getState()` access suffices.

**Validation:**
- Full scenario: `initializeDevices()` → `connect()` → `startCamera()` → verify track appears in remote peer view.
- Full scenario: `startCamera()` → `connect()` (pending track) → verify track added on join.
- Full scenario: disconnect → reconnect → verify track re-added (when `addTracksOnReconnect: true`).
- Middleware scenario: apply canvas effect → verify transformed track sent, not raw track.
- Device switch scenario: `selectCamera(newId)` → verify `replaceTrack` called with new track.

---

### Step 5 — Move Screen Share into TS Client

**What changes:**
- Add `ScreenShareController` inside ts-client's `DeviceOrchestrator`.
- Expose `startScreenShare()`, `stopScreenShare()`, `setScreenShareTracksMiddleware()` on `FishjamClient`.
- `ClientState` gains `screenShare` field.
- `useScreenShareManager` in React SDK becomes a shim delegating to `client.startScreenShare()`.
- `useScreenShare()` public hook reads from `client.getState().screenShare`.

**Validation:**
- Screen share starts, remote peers receive video + audio tracks.
- Stopping screen share removes both tracks.
- Middleware applied to screen share tracks.
- `screenShare.active` correctly reflects state.

---

### Step 6 — Move Custom Sources into TS Client

**What changes:**
- Add `CustomSourceManager` inside ts-client's `DeviceOrchestrator`.
- Expose `setCustomSource(sourceId, stream)` on `FishjamClient`.
- `ClientState` gains `customSources: Record<string, CustomSourceState>`.
- Pending-source logic (call before `joined`) is preserved.
- `useCustomSourceManager` becomes a shim; `useCustomSource()` reads from `getState()`.

**Validation:**
- Custom source registered before connection is added on `joined`.
- `setCustomSource(id, null)` removes tracks.
- Multiple simultaneous custom sources work.

---

### Step 7 — Slim Down React SDK Contexts

**What changes:**
- Remove `CameraContext`, `MicrophoneContext`, `ScreenshareContext`, `CustomSourceContext`, `InitDevicesContext`, `PeerStatusContext` from `FishjamProvider`.
- Remove `useMediaDevices`, `useDeviceManager`, `useTrackManager`, `useScreenShareManager`, `useCustomSourceManager`, `usePeerStatus`, `useHandleTrackEnd`, `useRetryHelper` internal hooks (they are all now shims with no logic).
- `FishjamProvider` now only provides:
  1. `FishjamClientContext` — the ref to the `FishjamClient` instance.
  2. `FishjamClientStateContext` — the result of `useSyncExternalStore(client.subscribe, client.getState)`.
  3. `FishjamIdContext` — the Fishjam ID string.
- All public hooks (`useCamera`, `useMicrophone`, `useScreenShare`, `useCustomSource`, `useInitializeDevices`, `useConnection`, `usePeers`) read from `FishjamClientStateContext` and call `client.*` methods directly.

**React SDK after:** ~50% smaller. Provider setup is trivial. No internal state management.

**Validation:**
- Full E2E test: two peers join, camera/mic/screen share work, peer data visible.
- Confirm no extra re-renders: use React DevTools Profiler to verify updates are scoped.
- All existing public hook return shapes are identical.

---

### Step 8 — Implement ReactNativeDeviceManager

**What changes:**
- Add `ReactNativeDeviceManager` to `mobile-client`.
- Uses `react-native-webrtc`'s `mediaDevices.getUserMedia()`, `mediaDevices.enumerateDevices()`.
- `getDisplayMedia` → native screen share flow (platform-specific).
- No `IDevicePersistence` (or AsyncStorage-backed one, opt-in).
- `mobile-client` `FishjamProvider` passes `ReactNativeDeviceManager` to `FishjamClient`.
- Remove the `react-native-webrtc` polyfill hack that made browser APIs available — all media calls now go through the interface.

**Mobile SDK after:** No longer relies on global navigator polyfill for device operations. Cleaner separation.

**Validation:**
- Run mobile E2E tests on iOS simulator and Android emulator.
- Camera start, mic start, screen share (where available).
- Device switching mid-session.

---

### Step 9 — Documentation, Changelog, and Release

**What changes:**
- Update README and API docs for TS client (new `getState()`, `subscribe()`, device methods).
- Update README for React SDK (simplified provider, thin hooks).
- Add migration guide for consumers (see §6).
- Bump major version (breaking changes in TS client constructor and React SDK internals).
- Publish `@fishjam-cloud/ts-client@2.0.0` and `@fishjam-cloud/react-client@2.0.0`.

---

## 6. Breaking Changes & Mitigation

### BC1 — FishjamClient Constructor Signature (Minor)

**What breaks:** `deviceManager` is a new constructor option. Existing usage without it is unaffected.

**Impact:** None for existing consumers. The default behaviour (no device management in TS client) is preserved until consumers opt in.

**Mitigation:** The parameter is optional with a backward-compatible default.

---

### BC2 — FishjamProvider Props

**What breaks:** Several props currently on `FishjamProvider` will change:
- `constraints`, `persistLastDevice`, `bandwidthLimits`, `videoConfig`, `audioConfig` move from `FishjamProvider` props to `FishjamClient` constructor options (since the client now owns this config).
- `FishjamProvider` becomes much simpler: `{ fishjamId, children, fishjamClient? }`.

**Impact:** Consumers who configure `FishjamProvider` with constraint/device props must migrate to the `FishjamClient` constructor.

**Mitigation:**
1. In the last minor version before the breaking release, add deprecation warnings if old props are provided.
2. Provide a compatibility shim: `FishjamProvider` accepts the old props and internally passes them to the client it creates — this allows a gradual migration.
3. Include a codemod (or migration guide with before/after examples) in the changelog.

```typescript
// Before (v1):
<FishjamProvider
  fishjamId="..."
  constraints={{ video: true, audio: true }}
  persistLastDevice
  bandwidthLimits={{ video: 1500 }}
>

// After (v2):
const client = new FishjamClient({
  deviceManager: new WebDeviceManager({ persistLastDevice: true }),
  defaultConstraints: { video: true, audio: true },
  bandwidthLimits: { video: 1500 },
});
<FishjamProvider fishjamId="..." fishjamClient={client}>
```

---

### BC3 — Internal Context Shape (React SDK Internals)

**What breaks:** `CameraContext`, `MicrophoneContext`, `ScreenshareContext`, `CustomSourceContext` are removed. Any consumer that imports these contexts directly (not via the public hooks) will break.

**Impact:** Low. These are internal by convention but not enforced. Some advanced consumers may use them.

**Mitigation:** Add `@internal` JSDoc tags in the minor version before the breaking release, and emit a runtime warning if the contexts are accessed directly. In the breaking release, remove them.

---

### BC4 — `useCamera` / `useMicrophone` Return Shape

**What might change:** `cameraStream` (a `MediaStream`) and `isCameraOn` are currently computed from React state. After the refactor, they are derived from `ClientState`. The shapes should remain identical — but `cameraStream` may be dropped or changed since the TS client stores `IMediaTrack` rather than `MediaStream`.

**Recommendation:** Maintain `cameraStream` in the hook return for backward compatibility by reconstructing a `MediaStream` from the track(s) in `ClientState.camera`. This is a thin compatibility wrapper in the React hook.

---

### BC5 — `useInitializeDevices` Signature

**What breaks:** `initializeDevices()` currently returns `{ status, stream, errors }` where `stream` is a `MediaStream`. After the refactor, the stream is internal to the client.

**Mitigation:** Keep the same return shape but populate `stream` from `client.getState().camera.rawTrack` (wrapped in a `MediaStream`). Mark `stream` as `@deprecated` — consumers should use `useCamera().cameraStream` instead.

---

### BC6 — Direct `FishjamClient` Usage by Advanced Consumers

**What breaks:** Consumers who directly call `fishjamClient.addTrack()` for device tracks will conflict with the internal managers now doing the same.

**Mitigation:** The `addTrack` / `replaceTrack` / `removeTrack` methods remain fully public and usable. The internal managers only manage tracks they create (camera, microphone, screen share, custom sources). Tracks added manually via `addTrack()` are unaffected. Document this clearly.

---

### Versioning Strategy

| Package | Current | After Step 7 | Notes |
|---------|---------|-------------|-------|
| `@fishjam-cloud/ts-client` | `0.25.x` | `1.0.0` | First stable major release; new device management API |
| `@fishjam-cloud/react-client` | `0.25.x` | `1.0.0` | Breaking: provider props change |
| `@fishjam-cloud/mobile-client` | `0.25.x` | `1.0.0` | Breaking: RN device manager required |

Steps 1–2 can be released as `0.26.x` (additive, non-breaking).
Steps 3–6 can be released as a series of `0.27.x`–`0.29.x` patches if the React SDK shim layer is maintained.
Step 7 (slim down React SDK) is the breaking release: `1.0.0`.

---

## Appendix: File-Level Change Summary

| File | Action |
|------|--------|
| `ts-client/src/FishjamClient.ts` | Major additions: store, device methods |
| `ts-client/src/state/ClientState.ts` | New file |
| `ts-client/src/devices/IDeviceManager.ts` | New file |
| `ts-client/src/devices/DeviceOrchestrator.ts` | New file |
| `ts-client/src/devices/CameraController.ts` | New file |
| `ts-client/src/devices/MicrophoneController.ts` | New file |
| `ts-client/src/devices/ScreenShareController.ts` | New file |
| `ts-client/src/devices/CustomSourceManager.ts` | New file |
| `ts-client/src/devices/constraints.ts` | Moved from react-client |
| `ts-client/src/utils/bandwidth.ts` | Moved from react-client |
| `react-client/src/devices/WebDeviceManager.ts` | New file |
| `react-client/src/devices/LocalStorageDevicePersistence.ts` | New file (from utils/localStorage) |
| `react-client/src/hooks/internal/useTrackManager.ts` | Deleted (Step 7) |
| `react-client/src/hooks/internal/devices/useMediaDevices.ts` | Deleted (Step 7) |
| `react-client/src/hooks/internal/devices/useDeviceManager.ts` | Deleted (Step 7) |
| `react-client/src/hooks/internal/devices/useHandleTrackEnd.ts` | Deleted (Step 7) |
| `react-client/src/hooks/internal/useScreenshareManager.ts` | Deleted (Step 7) |
| `react-client/src/hooks/internal/useCustomSourceManager.ts` | Deleted (Step 7) |
| `react-client/src/hooks/internal/usePeerStatus.ts` | Deleted (Step 7) |
| `react-client/src/hooks/internal/useRetryHelper.ts` | Deleted (Step 7) |
| `react-client/src/contexts/camera.ts` | Deleted (Step 7) |
| `react-client/src/contexts/microphone.ts` | Deleted (Step 7) |
| `react-client/src/contexts/screenshare.ts` | Deleted (Step 7) |
| `react-client/src/contexts/customSource.ts` | Deleted (Step 7) |
| `react-client/src/contexts/initDevices.ts` | Deleted (Step 7) |
| `react-client/src/contexts/peerStatus.ts` | Deleted (Step 7) |
| `react-client/src/FishjamProvider.tsx` | Significantly simplified |
| `react-client/src/hooks/devices/useCamera.ts` | Becomes thin wrapper |
| `react-client/src/hooks/devices/useMicrophone.ts` | Becomes thin wrapper |
| `react-client/src/hooks/useScreenShare.ts` | Becomes thin wrapper |
| `react-client/src/hooks/useCustomSource.ts` | Becomes thin wrapper |
| `react-client/src/hooks/useConnection.ts` | Remains, reads from getState() |
| `react-client/src/hooks/usePeers.ts` | Remains, transforms from getState() |
| `mobile-client/src/devices/ReactNativeDeviceManager.ts` | New file |
| `mobile-client/src/FishjamProvider.tsx` | Updated to pass RN device manager |
