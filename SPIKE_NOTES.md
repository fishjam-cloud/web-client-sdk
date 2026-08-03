# spike/tsunami-full — build notes (not for extraction; delete before any PR)

Working rules: react-client `src/tests/**` is READ-ONLY (69 tests = fixed contract; `git diff` must stay empty there). tsunami tests are ours. AGENTS.md error rules apply. One event → one store update. Map reports live in the session scratchpad `map/` dir (test-seams, provider-connection, device-layer, screenshare-middleware, stash-controllers, public-surface).

## Slice log

### Slice 1 — DONE (commit "slice 1: client wiring ...")
- StateStore: notifications now SYNCHRONOUS (microtask batching broke sync `act()` assertions in connection.spec). One notification per effective update(); each signalling event composes ONE update (joined = peerStatus+participants in one call).
- ClientState = connection slices only. FishjamClient: `signallingClient` injection (the FCE-3030 fake seam), getState/subscribe/subscribeToSlice, bindSessionStateEvents, dispose clears store.
- react-client: provider wraps injected ts-client in tsunami client; usePeerStatus/useReconnection/useFishjamClientState = useSyncExternalStore over the store; FishjamClientContext holds tsunami client (type ripple in ~8 files); useScreenshareManager awaits addTrack (FCE-3580 rejection contract; keep-local recovery preserved).
- PENDING FOLLOW-UP: open PR #581 (mfilimowski/fce-3578) still ships microtask batching — needs amending to sync notify; tell user before touching it.

### Slice 2 — IN PROGRESS: device core (camera + microphone + initializeDevices together — init shares its stream with both device controllers, inseparable)
Design decisions:
1. **Device errors per AGENTS.md**: classes extending FishjamError with legacy name literals ("NotAllowedError" | "NotFoundError" | "OverconstrainedError" | "UNHANDLED_ERROR"), recoverability set, platform cause. Classification lives in the IDeviceManager IMPL (rule 4): WebDeviceManager's getUserMedia/getDisplayMedia reject with classified DeviceError; core never touches DOMException names except via `error.name` on already-classified DeviceError.
2. **react-client boundary conversion**: specs assert `toEqual({ name: "..." })` (plain object). FishjamError instances have extra enumerable props → the provider adapter converts instance→`{ name }` plain object wherever DeviceError reaches the public hook surface (deviceError, startCamera tuple).
3. Port from stash (donor, adjust to error model): devices/{constraints,mediaInitializer}.ts, tracks/trackUtils.ts, controllers/{TrackPublisher,TrackDeviceController,DeviceOrchestrator}.ts, deviceManager.ts platform-types delta, mediaTypes.ts, ClientState grows camera/microphone/availableCameras/availableMicrophones/cameraError/microphoneError/devicesInitialized slices. FishjamClient config grows deviceManager/constraints/bandwidthLimits/streamConfigs; device API methods; `devices` internal getter.
4. react-client provider: replace useMediaDevices/useDeviceManager/useTrackManager wiring for camera+mic with adapters over tsunami controllers, PRESERVING context value shapes (`DeviceManager`, `TrackManager` types) so useCamera/useMicrophone/useInitializeDevices hook bodies stay ~untouched. Provider passes `deviceManager: new WebDeviceManager({ persistence })` + constraints etc. into the tsunami client (stash FishjamProvider L149–171 is the donor for the adapter shapes).
5. ScreenShare/CustomSource stay on the OLD react-client path this slice (they don't use the device managers; they call navigator/fishjamClient directly). Orchestrator constructs camera+microphone only until their slices.
6. Store sync: DeviceOrchestrator.syncStore writes one update() with all device slices; controller snapshot() memoization keeps slice refs stable.

Fixed-contract seams to respect (from test-seams map): fakes patch `navigator.mediaDevices` + global MediaStream (WebDeviceManager reads exactly that — keeps working); `persistLastDevice: false` default in renderWithProvider → persistence must be injectable/disable-able through provider props as today; fake tracks key off `getSettings().deviceId`.

Behavioral invariants the port must preserve (device-layer map): init dedup (in-flight promise reuse; rejection resets; already_initialized short-circuit), initial combined stream shared by both controllers + invalidated when either side diverges, `deviceId: {ideal}` on init vs `{exact}` on explicit start/select, Safari label-matching correction, getAvailableMedia fallback ladder (audio-only→video-only, Overconstrained retry with stripped deviceId), enabled=false reapplied to fresh tracks while muted, selectDevice without live track only records selection, stopDevice performs NO signalling call, toggleMute requires published track (warn otherwise), pause=replaceTrack(null)+metadata paused:true, resume=replaceTrack(track)+paused:false, join auto-publish (catch TrackTypeError silently, log others), local-id→remote-id resolution awaiting in-flight addTrack, `correctDevicesOnSafari` only from initializeDevices.

### Slice 3 (todo): ScreenShareController + swap useScreenShare + FCE-3574 (middleware persistence across restart)
### Slice 4 (todo): CustomSourceController + swap useCustomSource
### Slice 5 (todo): remaining state slices (bandwidthEstimation, dataChannel*, VAD if needed) + remaining hooks (useDataChannel reads PeerStatusContext — already store-backed; useVAD/useLocalVAD, useStatistics, useUpdatePeerMetadata mostly delegate — verify)
### Then: vanilla demo + Angular example (first-class, zoneless+signals, behavioral suite mirroring FCE-3030 scenarios), demolition pass (see stash map §5 weak spots: orchestrator delegation altitude, TrackPublisher single-impl, unused constraints consts, dead trackUtils export, snapshot memoization duplication, setError/adoptInitialStream orchestrator-private-as-public), re-slice history, commit→ticket map, final validation (FCE-3030 zero-diff, Angular suite, root gates, fishjam-chat via Argent, live two-tab).

## Verification loop per slice
tsunami: tsc + test + build. react-client: tsc + test (69/69) + `git diff --stat src/tests/` empty. Commit per slice.
