# spike/tsunami-full — build notes (not for extraction; delete before any PR)

Working rules: react-client `src/tests/**` is READ-ONLY (69 tests = fixed contract; `git diff` must stay empty there). tsunami tests are ours. AGENTS.md error rules apply. One event → one store update. Map reports live in the session scratchpad `map/` dir (test-seams, provider-connection, device-layer, screenshare-middleware, stash-controllers, public-surface).

## Slice log

### Slice 1 — DONE (commit "slice 1: client wiring ...")
- StateStore: notifications now SYNCHRONOUS (microtask batching broke sync `act()` assertions in connection.spec). One notification per effective update(); each signalling event composes ONE update (joined = peerStatus+participants in one call).
- ClientState = connection slices only. FishjamClient: `signallingClient` injection (the FCE-3030 fake seam), getState/subscribe/subscribeToSlice, bindSessionStateEvents, dispose clears store.
- react-client: provider wraps injected ts-client in tsunami client; usePeerStatus/useReconnection/useFishjamClientState = useSyncExternalStore over the store; FishjamClientContext holds tsunami client (type ripple in ~8 files); useScreenshareManager awaits addTrack (FCE-3580 rejection contract; keep-local recovery preserved).
- RESOLVED 2026-08-04: PR #581 was closed by Miłosz — nothing to amend. The sync-notify StateStore on this branch is the version of record for FCE-3578.

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

### Slices 3-4 — DONE (commit "slices 3-4: ...")
- ScreenShareController + CustomSourceController ported; provider contexts are store-backed memo adapters; old manager hooks deleted.
- FCE-3574 FIXED (middleware persisted + re-applied). THE one test-file diff: screenShare.spec.ts quirk assertion flipped per its own documented intent. SIGNED OFF by Miłosz 2026-08-04 — the new behavior is correct; FCE-3574 closes with the extraction PR.

### Slice 5 — RESOLVED AS EMPTY (consumer-first verdict)
- useDataChannel/useVAD/useLocalVAD/useStatistics/useUpdatePeerMetadata/useSandbox/livestream hooks all pass unaltered on the tsunami client (events + delegation). NO dataChannel/bandwidthEstimation ClientState slices added — no consumer pull (would repeat the ClientState-before-consumer mistake).
- FCE-3579 (high-frequency VAD channel bypassing store): NO current consumer — the existing VAD hooks poll getLocalTrackAudioLevel + re-render off track events and their specs pass. Finding: defer/re-scope the ticket.
- Dead code swept: react-client utils/track.ts, utils/bandwidth.ts, devices/, provider logger.
### Then: vanilla demo + Angular example (first-class, zoneless+signals, behavioral suite mirroring FCE-3030 scenarios), demolition pass (see stash map §5 weak spots: orchestrator delegation altitude, TrackPublisher single-impl, unused constraints consts, dead trackUtils export, snapshot memoization duplication, setError/adoptInitialStream orchestrator-private-as-public), re-slice history, commit→ticket map, final validation (FCE-3030 zero-diff, Angular suite, root gates, fishjam-chat via Argent, live two-tab).

## Verification loop per slice
tsunami: tsc + test + build. react-client: tsc + test (69/69) + `git diff --stat src/tests/` empty. Commit per slice.

### Demolition pass — verdicts (all suites green after)
- APPLIED: orchestrator screen-share delegation wrappers removed (altitude now uniform: client -> requireDevices().<controller>.<method> for all four controllers).
- APPLIED: dead code deleted — AUDIO_TRACK_CONSTRAINTS, SCREEN_SHARING_MEDIA_CONSTRAINTS, tsunami trackUtils.getRemoteOrLocalTrackContext (inline copy in createTrackPublisher is the single real impl), react-client utils/errors trimmed to MissingSandboxApiUrlError (parseUserMediaError + {name} consts gone).
- KEPT: TrackPublisher — earns its keep as the confined DOM/platform track cast boundary and keeps controllers signalling-agnostic; single impl acceptable.
- KEPT: per-controller snapshot() memoization duplication (2 sites, explicit beats indirection at this size).
- KEPT (documented): TrackDeviceController.setError/adoptInitialStream are orchestrator-private wiring exposed as public (TS has no friend classes); isSignallingActive vs getPeerStatus gating overlap left as-is (suite pins both behaviors; unifying risks semantic drift).

### Live validation — fishjam-chat on iOS simulator (Argent) + vanilla web peer
- App boots on the tsunami-backed stack; initializeDevices triggers mic permission; sandbox token + join works; two-party call with the vanilla demo (Playwright, fake camera): web saw remotePeers=1 + the sim's video track rendered; peer-left propagated both ways; leave clean.
- FIX FOUND ON DEVICE: RN's polyfilled navigator.mediaDevices has no addEventListener — WebDeviceManager.onDeviceChange now feature-detects (react-client's provider hard-instantiates WebDeviceManager, which mobile-client inherits via re-export).
- FINDING for the mobile slice: the proper fix is a deviceManager injection point in FishjamProvider so mobile passes ReactNativeDeviceManager (it exists, still unused); the feature-detect makes the WebDeviceManager-over-RN-polyfill path work meanwhile.
- Vanilla render count over the whole join+track flow: 16 notifications (sane; sync-notify not spammy).

### Mobile overhaul (2026-08-04) — native device layer + polyfill diet, 5 commits
Scope locked by user: keep only the 3 load-bearing engine globals, no ts-client/webrtc-client changes, no fork changes, breaking change for apps using removed globals accepted.
1. react-client `FishjamProvider` gains `deviceManager` + `clientType` props; an injected manager owns persistence (the `persistLastDevice` branch is skipped entirely, which is what makes mobile's localStorage polyfill removable).
2. `IDeviceManager.createMediaStream` — stream construction moved behind the platform boundary; `TrackDeviceController` exposes a render-ready stream scoped to the ACTIVE track (initializeDevices shares one stream across camera+mic, so a naive passthrough would leak the other kind into a preview); useCamera/useMicrophone/useLivestreamStreamer no longer touch the `MediaStream` global.
3. `ReactNativeDeviceManager` hardened BEFORE going live: real bug fixed — the fork rejects with `MediaStreamError` (NOT an Error) naming permission denial `SecurityError`, so denials classified as UNHANDLED_ERROR; now duck-typed → NotAllowedError. Permission warnings moved off the navigator monkey-patch onto the acquisition path. `displayMediaOptions` ctor option; `onDeviceChange` honest no-op (deletes the FCE-3689 cast here).
4. Mobile provider: own module, `clientType:'mobile'` + module-level native manager, no per-render ts-client allocation, NO deviceManager prop exposed to apps (user decision).
5. `webrtc-polyfill.ts` → `globals.ts`: no `registerGlobals()`; sets only RTCPeerConnection (the getConfiguration-caching subclass), RTCIceCandidate, MediaStream from direct fork imports. Deleted: local-storage polyfill, overrides/getUserMedia.ts, EventTarget global. README breaking note.

VALIDATED ON SIMULATOR (iPhone 16 Pro, iOS 18.6, fishjam-chat, Metro 8081): app boots, permissions prompt → denial path shows the app's denied state, grant + relaunch → camera preview renders through RTCView (SimCam placeholder = live camera frames), join sandbox room reaches the Room screen with call controls. Hermes eval proved the diet exactly: navigator.mediaDevices / localStorage / EventTarget / MediaStreamTrack / RTCSessionDescription / RTCRtpSender / RTCRtpReceiver / RTCRtpTransceiver / RTCCertificate / RTCErrorEvent / MediaStreamTrackEvent all `undefined`; RTCPeerConnection + RTCIceCandidate + MediaStream present, constructible, `getConfiguration()` returns the config.
NOT covered this pass: web-peer bidirectional media (the vanilla demo's connect hung in headless Chrome — demo-side wiring, unrelated to the SDK change), screen-share picker, VAD indicator, livestream connect. Verify those before shipping.
Tests after: tsunami 66, react-client 71 (69 originals + 2 injection specs), mobile-client 16 (new: classification, permission warnings, displayMediaOptions, createMediaStream, provider shape, globals).
