# VoIP feature ideas (from expo-callkit-telecom gap analysis)

Comparison of `~/Desktop/expo-callkit-telecom` against our `packages/react-native-webrtc`
VoIP layer (`CallKit.ts` / `Telecom.ts` / `VoIP.ts`, `useVoIPEvents` / `useCallKit` /
`useTelecom`) and its native code (`ios/RCTWebRTC/CallKitManager.m`, `VoipManager.m`,
`android/.../voip/*`). Sorted by priority. Analysis: 2026-07-09 (two passes).

See the bottom for a **mapping to the FCE-3435 task** ("Handle common VoIP patterns").

Legend: 🔴 correctness / product quality · 🟠 user-visible polish · 🟡 API maturity · ⚪ DX/docs

---

## P0 — Correctness wins 🔴

### 1. Proper answer/connect handshake (fulfill/fail instead of instant-fulfill)
- **Ours:** iOS `performAnswerCallAction` fulfills the `CXAnswerCallAction` immediately
  (`CallKitManager.m:160`), so the system UI shows "connected" before WebRTC media exists,
  and a failed room-join can never be reported back to CallKit.
- **Theirs:** the action is parked in a `FulfillRequestManager` keyed by `requestId`;
  JS connects media then calls `fulfillIncomingCallConnected(requestId)` or
  `failIncomingCallConnected()` (fails the CXAction → CallKit tears the call down cleanly),
  with a configurable timeout (default 30 s). The iOS delegate literally `await`s the
  fulfill/cancel/timeout result before calling `action.fulfill()` / `action.fail()`
  (`CallManager+CXProviderDelegate.swift:58-95`). Same pattern on Android.
- Docs: [CXAnswerCallAction](https://developer.apple.com/documentation/callkit/cxanswercallaction)

### 2. Real outgoing-call connection reporting (+ dialtone hook)
- **Ours:** `startCallWithDisplayName` reports `startedConnecting` and `connected`
  back-to-back the moment the transaction succeeds (`CallKitManager.m:76-77`), so the
  system call timer starts before the remote party answers.
- **Theirs:** report `startedConnecting`, play optional dialtone (started from
  `didActivate audioSession` only while the outgoing call is still `connecting`), and only
  report connected when the app calls `reportOutgoingCallConnected(id)`. Correct call
  duration in the dynamic island / status bar / Recents.
- Docs: [reportOutgoingCall(with:connectedAt:)](https://developer.apple.com/documentation/callkit/cxprovider/reportoutgoingcall(with:connectedat:))

### 3. Call timeouts (incoming / outgoing / fulfill-answer) — ✅ DONE (verified 2026-07-15)
- **Ours:** none — an unanswered incoming call rings until something external stops it.
- **Theirs:** three configurable timeouts (incoming 45 s, outgoing 60 s, fulfill 30 s)
  baked into Info.plist / manifest metadata by the config plugin; expiry auto-ends the
  call with reason `unanswered` and stops the dialtone.
- **Status:** built on both platforms. iOS `CallKitManager.m:8-10`
  (`kDefaultIncomingCallTimeout=45`, `kDefaultOutgoingCallTimeout=60`,
  `kDefaultFulfillAnswerTimeout=10`, overridable via Info.plist keys
  `VoipIncomingCallTimeout` / `VoipOutgoingCallTimeout` / `VoipFulfillAnswerTimeout`);
  Android `CallManager.kt:54-56` (same 45/60/10 s defaults, `ringTimeoutJob` /
  `waitingRingTimeoutJob`). Note: our fulfill default is **10 s**, not the 30 s above.

### 4. `serverCallId` + opaque `metadata` in the push payload, with dedup — ⚠️ PARTIAL (verified 2026-07-15)
- **Ours:** payload hardwired to `roomName` / `displayName` / `isVideo`; any new field
  requires native changes on both platforms. No dedup — a duplicate FCM send
  double-reports the call on Android.
- **Theirs:** `{ eventId, serverCallId, hasVideo, startedAt, caller: {...}, metadata }`
  wrapped under a canonical `incomingCall` key (snake_case `incoming_call` accepted for
  back-compat). `metadata` is forwarded verbatim (auth token, chatId, room config…).
  `eventId` drives a dedup window on Android (`ExpoCallKitTelecomMessagingService.kt`)
  and `Equatable` on iOS. `startedAt` lets the call be backdated. Documented payload
  shape in `docs/voip-push.md`.
- **Status — asymmetric, remaining work is Android + dedup:**
  - ✅ **iOS opaque passthrough done:** `VoipManager.m:75` mutable-copies and forwards the
    *entire* `payload.dictionaryPayload`, surfaced to JS via `getPendingIncomingCall()`
    (`VoIP.ts:32`) — so `serverCallId` / arbitrary `metadata` already ride through with no
    native change.
  - ❌ **Android still hardwired:** `PushNotificationService.kt:27-31` extracts only
    `roomName` / `displayName` / `handle` / `isVideo` into a typed
    `VoipPushRegistry.Incoming`; any extra `metadata` field is dropped. Needs an
    opaque-map passthrough to reach JS parity with iOS.
  - ❌ **Dedup not implemented** on either platform (no `eventId` window); no canonical
    `incomingCall` wrapper key.

### 5. Killed-app decline broadcast (Android)
- **Ours:** if the user declines while the app process is dead, no JS ever runs and the
  decline is silently dropped — the caller keeps ringing until a server timeout.
- **Theirs:** a package-internal broadcast carrying the full event JSON (embedding the
  session, so `serverCallId` + push `metadata` like a decline auth token are available
  with zero app-side state) fires when a call event can't reach a live JS observer.
  The host app registers a manifest `BroadcastReceiver` (plugin prop
  `androidEventReceiver`) and POSTs the decline to the backend. Their test-push script
  even demos it: `--metadata '{"declineToken":"abc"}'`. See their `docs/platform-notes.md`.

### 6. End reasons (`CallEndedReason`) — ✅ DONE (verified 2026-07-15)
- **Ours:** bare `endCall()`, no reasons anywhere.
- **Theirs:** `reportCallEnded(id, reason)` with
  `failed | remoteEnded | unanswered | answeredElsewhere | declinedElsewhere`, mapped to
  [CXCallEndedReason](https://developer.apple.com/documentation/callkit/cxcallendedreason)
  — correct "missed" vs "declined" in Recents, and multi-device "answered elsewhere"
  becomes expressible.
- **Status:** built. `endCall(reason?)` / `endCallKitSession(reason?)` take a
  `CallEndedReason` (`Telecom.ts:40`), iOS maps it in `cxEndedReasonForReason`
  (`CallKitManager.m:242`) and Android in `reasonToCause` / `causeToReason`
  (`CallManager.kt:216-232`, both directions). Our shipped reason set is
  `local | rejected | missed | remote | answeredElsewhere | failed` — the names differ
  from theirs above (`missed`≈`unanswered`, `remote`≈`remoteEnded`, no separate
  `declinedElsewhere`; `rejected` is Android-only, folds to `local` on iOS).

### 7. FCM messaging-service coexistence (Android) — ⏸ DEFERRED
Implemented and verified (compiled) on 2026-07-09, then reverted — to be revisited.
The design below is ready to re-apply. **Extended plan** (research into Twilio / Stream /
expo-callkit-telecom approaches + multi-library support and payload interception):
see [FCM-COEXISTENCE-PLAN.md](./FCM-COEXISTENCE-PLAN.md).

- **Problem:** `PushNotificationService` extends `FirebaseMessagingService` directly and
  silently swallows non-VoIP data messages (`onMessageReceived` returns early). Android
  routes `MESSAGING_EVENT` to **one** service per app — so a host app that also uses
  `expo-notifications` / react-native-firebase / Notifee either loses its notifications
  or our calls. A production blocker for any app with normal pushes.
- **Why routing is deterministic (not an unknown):** our service is declared in the
  **app** manifest (bare setup + `withFishjamVoip.ts`), while notification libraries
  declare theirs in their **library** manifests; the manifest merger puts app-declared
  components first and FCM binds the first `MESSAGING_EVENT` match — so ours always
  receives first. Adding `android:priority="1"` to our intent-filter makes this a hard
  guarantee instead of a merge-order convention. We do NOT need to know which
  notification library the user has.
- **Designed fix** (was in `PushNotificationService.kt`):
  1. VoIP pushes must carry `voip: "true"` in the FCM data (breaking: server must add
     it — one line in `server/main.ts` + payload docs in both READMEs).
  2. Non-VoIP messages and `onNewToken` refreshes are relayed to the *next*
     `MESSAGING_EVENT` service found via `packageManager.queryIntentServices` —
     discovered at runtime, so it works with any notification library, no Expo
     dependency (their `super`-delegation trick only works for expo-notifications).
     The delegate is instantiated reflectively with the app context attached
     (`ContextWrapper.attachBaseContext` via reflection — public SDK method).
  3. Companion helpers `handleVoipMessage(context, message): Boolean` /
     `handleNewToken(token)` for the inverse setup where the host insists on keeping
     its own service registered and delegates the VoIP path to us.
- **iOS verified, no change needed:** VoIP pushes ride PushKit (`apns-push-type: voip`,
  topic `<bundleId>.voip`) — a channel separate from regular APNs; `VoipManager` registers
  only `PKPushTypeVoIP` and the pod never touches `UNUserNotificationCenter` /
  `didReceiveRemoteNotification`, so no cross-interception is possible in either
  direction. A payload gate on iOS would actually be harmful: iOS 13+ kills apps that
  receive a VoIP push without reporting a CallKit call.

---

## P1 — User-visible polish 🟠

### 8. Rich caller identity: `CallParticipant` + avatar pictures
- **Theirs:** remote party is `{ id, displayName, avatarUrl, phoneNumber, email }`;
  we pass a bare display-name string.
- **Avatar on the Android full-screen UI:** their `IncomingCallActivity` downloads
  `avatarUrl` (5 s connect/read timeouts, circular crop via
  `RoundedBitmapDrawableFactory`, silent initials fallback). Ours already has the
  initials circle — drop-in spot for the photo.
- **Avatar in the Android notification (our idea — neither library does it):** set the
  downloaded bitmap as the [`Person.Builder.setIcon`](https://developer.android.com/reference/androidx/core/app/Person.Builder#setIcon(androidx.core.graphics.drawable.IconCompat))
  on the CallStyle notification → caller's face in the shade + lock-screen banner,
  WhatsApp-style. Needs an async fetch + `notify()` update once the bitmap lands
  (post the text-only notification first to stay within Telecom's ~5 s window).
- **iOS caveat:** CallKit's system UI cannot render caller images — `avatarUrl` is still
  worth carrying in the session for our own in-app UI.

### 9. App logo in the iOS CallKit UI (our idea — neither library does it)
- Set [`CXProviderConfiguration.iconTemplateImageData`](https://developer.apple.com/documentation/callkit/cxproviderconfiguration/icontemplateimagedata)
  — a 40×40 pt template (alpha-mask) PNG shown as the app button/badge in the native
  incoming-call and in-call UI. Without it iOS shows a generic blank button.
  Also worth setting `localizedName` explicitly. Ships as a bundled asset; could be a
  config-plugin prop (`callkitIconIos`) later.
- Android equivalent exists in their full-screen activity: an app-branding row
  (app icon + label from `PackageManager`) at the top of the incoming screen.

### 10. Custom sounds: ringtone (iOS + Android) and outgoing dialtone
- **iOS ringtone:** bundled sound on
  [`CXProviderConfiguration.ringtoneSound`](https://developer.apple.com/documentation/callkit/cxproviderconfiguration/ringtonesound).
- **Android ringtone:** set as the incoming channel sound; channel settings are immutable
  after creation, so they embed the ringtone name in the channel id and rotate channels
  on config change (`CallNotificationManager.kt` in their repo) — copy that trick.
- **Dialtone:** looping fade-in ringback while an outgoing call connects
  (`DialtonePlayer` on both platforms), stopped on connect/timeout/end. We are silent.

### 11. iOS Recents + Siri ("call X") integration
- `includesCallsInRecents = true` (we set `NO`), handles from `phoneNumber`/`email` as
  typed [`CXHandle`](https://developer.apple.com/documentation/callkit/cxhandle)s
  (enables Contacts matching → name + photo on the lock screen via the contact card),
  [`INStartCallIntent`](https://developer.apple.com/documentation/sirikit/instartcallintent)
  handling in the app delegate → `CallIntentReceivedEvent { handle, handleType, hasVideo }`,
  `NSUserActivityTypes` registration, and an `outgoingSystem` session origin.

### 12. Android notification lifecycle: dialing + ended states
- **Theirs:** four states — incoming (ring + FSI), **dialing** ("Dialing…" with hangup
  for outgoing; we show nothing while dialing), ongoing (chronometer), and **ended**
  (brief "Call ended", auto-dismiss after 2 s). We only do incoming → ongoing.
- Bonus neither has: i18n / copy overrides for channel names and notification strings
  ("Incoming video call", "Dialing…") — all hardcoded English in both libraries.

### 13. Incoming-call activity refinements (Android) — *found on second pass*
Our `IncomingCallActivity` (swipe-to-answer) is nicer visually, but theirs has behaviors
worth porting:
- **Keyguard dismissal:** answer → `KeyguardManager.requestDismissKeyguard` with a
  callback, launching the main activity on success/cancel/error. The call is answered
  *before* unlock ("audio connects before the device is unlocked", matching iOS).
- **Auto-dismiss via session state:** observes the call-store `Flow` and finishes when
  status leaves `RINGING` (answered elsewhere, timeout, remote hangup) + re-checks in
  `onResume`. Ours relies on a single `ACTION_CALL_ENDED` broadcast.
- **Video-call affordance:** answer button switches to a videocam icon for video calls.

---

## P2 — API maturity 🟡

### 14. Call-session model + store events
- Native `CallStore` of `CallSession { id, options, origin, remoteParticipants,
  incomingCallEvent, status, connectedAt, isMuted, isOnHold, dtmfDigits }` with lifecycle
  `requesting → ringing/connecting → connected → ended`;
  `onCallSessionAdded/Updated/Removed` events + `getActiveCallSession()`.
  Ours: two booleans.
- Their example distills this into a ~25-line `useCallSession()` hook (hydrate from
  `getActiveCallSession()`, then the three listeners) — the exact shape a `useVoIP`
  SDK hook could return.
- Also: `providerDidReset` does full cleanup (stop dialtone, cancel all timeouts,
  cancel pending fulfill requests, clear store); ours only nulls the call UUID.

### 15. Event queueing with `meta: { flushed, timestamp }`
- Per-event queues with limits (1 for most, 0 = drop for stateful ones like mute),
  flushed on `startObserving`, every event stamped with meta so JS can tell replayed
  cold-start events from live ones. Ours: a single `pendingIncomingCall` slot plus
  ad-hoc `isCallAnswered()` re-checks.

### 16. Mid-call controls
- **Hold:** `setHeld(id, onHold)` + `SetHeldActionEvent` + `isOnHold` on the session.
  On Android the core-telecom `onSetActive` / `onSetInactive` callbacks are mapped to
  held-state events too — so a **cellular call taking over the device** properly puts
  the VoIP call on hold and JS hears about it (`CallManager.kt:699-700` in their repo).
  Our iOS delegate has `onCallHeld` but no JS initiator; our Android `CallAction.Hold`
  is unreachable from JS and `onSetInactive` is an empty block.
- **DTMF:** `playDTMF(id, digits)` + `DTMFEvent` via
  [CXPlayDTMFCallAction](https://developer.apple.com/documentation/callkit/cxplaydtmfcallaction).
- **Video upgrade/downgrade:** `reportVideo(id, enabled)` → session update + audio-session
  re-prepare + [`CXCallUpdate`](https://developer.apple.com/documentation/callkit/cxcallupdate)
  so the system UI flips audio↔video mid-call. Our `isVideo` is frozen at start.
- **Programmatic answer:** `answerCall(id)` drives a real `CXAnswerCallAction` so
  answering from in-app UI keeps CallKit in sync (our iOS has no programmatic answer).
- **Programmatic mute:** `setMuted(id, muted)` via `CXSetMutedCallAction` with
  state-dedup, so CallKit's mute button and the in-app one never diverge.

### 17. Audio session APIs
- `prepareAudioSessionForCall(hasVideo)` / `restoreAudioSession()` — snapshot & restore
  the pre-call [AVAudioSession](https://developer.apple.com/documentation/avfaudio/avaudiosession)
  config (snapshot-once semantics so repeated prepares don't clobber the saved state;
  video → speaker default via `.defaultToSpeaker` + `videoChat` mode, audio → earpiece
  via `voiceChat` mode).
- `getAudioSession()` — one cross-platform snapshot: active flags, category/mode/options,
  sample rate, mic permission, `isOtherAudioPlaying`, current + available routes with a
  normalized port-type enum (`builtInReceiver`, `bluetoothHFP`, `carAudio`, `airPlay`…).
- `setAudioSessionPortOverride(speaker)` — one-call speakerphone toggle.
- `onAudioSessionActivated/Deactivated` (with the affected call ids) and
  `onAudioRouteChanged` — driven by a `NotificationCenter` route-change observer, so
  route events (AirPods in/out) flow even outside calls.
- We already have `RTCAudioSession.ts` / `useAudioOutput`; the gap is the snapshot/restore
  pair, the unified snapshot, and call-linked activation events.

### 18. VoIP token API shape
- `getVoIPPushToken()` returns `{ token, type: "APNS_VOIP" | "FCM" }` so the backend
  knows the transport; a token-**invalidated** event (`token: undefined`) — our iOS
  `didInvalidatePushTokenForType` nulls the token and JS never learns; and a small
  `useVoIPPushToken()` hook.

### 19. Malformed-push fallback (iOS)
- PushKit requires reporting a call for every VoIP push or the app is terminated.
  On parse failure they report a placeholder "Invalid Call" and immediately end it
  (`VoIPPushManager+PKPushRegistryDelegate.swift`). Ours defaults the display name but
  JS-side `assertRoomName` can still leave a stuck session.

### 20. Capture-session info
- `getCaptureSession()`: camera permission +
  [`isMultitaskingCameraAccessSupported`](https://developer.apple.com/documentation/avfoundation/avcapturesession/ismultitaskingcameraaccesssupported)
  (iOS 16+) — relevant for keeping video capture alive in PiP during CallKit calls.

---

## P3 — DX & docs ⚪

### 21. Expo config plugin
- Automates what we document as manual steps: `aps-environment` entitlement,
  `UIBackgroundModes` (`voip`, `audio`), mic/camera permission strings (customizable),
  Siri intents, timeout constants, sound bundling into Xcode + `res/raw` (with raw-name
  sanitization), FCM service manifest surgery (`tools:node="remove"`), `MANAGE_OWN_CALLS`
  wiring, `androidEventReceiver` registration.
- Docs: [Expo config plugins](https://docs.expo.dev/config-plugins/introduction/)

### 22. Test-push server script — *found on second pass*
- `example/server/send-test-push.ts`: zero-dependency (node:crypto + node:http2 + fetch)
  script that signs an APNs JWT and an FCM OAuth token from key files and sends the same
  `IncomingCallEvent` over both transports, with flags for `--video`, `--display`,
  `--phoneNumber` (E.164 → contact matching), `--metadata '{...}'`, `--production`,
  `--ios/--android` auto-detection. Our `examples/mobile-client/voip-call/server` could
  adopt the flag ergonomics + shared event-builder (`lib/event.ts`) structure.

### 23. Structured native logging
- Category-based [`os.Logger`](https://developer.apple.com/documentation/os/logger) on
  iOS, tagged lazy-lambda logging on Android — vs our `NSLog` / silently-swallowed
  exceptions.

### 24. Docs & discoverability
- Typedoc-generated API reference, docs site, `llms.txt`, documented push-payload shape,
  and a keep-alive note (pair with native timers, e.g.
  [react-native-nitro-keepalive-timer](https://www.npmjs.com/package/react-native-nitro-keepalive-timer),
  for background WebSocket signaling) — directly relevant to our deferred
  WebSocket-signaling design.

---

## Mapping to FCE-3435 — "Handle common VoIP patterns"

Task: make the server aware of the call; production-ready example.

| Task bullet | Relevant items above |
| --- | --- |
| **WebSocket connection to monitor the call** | Nothing in expo-callkit-telecom does signaling itself — but: background JS timers throttle once the screen locks, so the socket heartbeat needs native keep-alive timers (#24); `serverCallId` + `metadata` (#4) is how the push hands the socket URL/auth to the app; `onIncomingCallReported` fires *before* answer, which is the right moment to open the socket early. |
| **Management token to create rooms (drop sandbox)** | Server-side only — no library feature. Their `example/server` structure (#22) is the pattern: env-validated key files + a shared event builder producing the push payload with `serverCallId` minted at room-creation time. |
| **Inform user if call was rejected** | Callee-side rejection reaching the server even when the app is killed: decline broadcast (#5) with `metadata.declineToken`. Caller-side display of the rejection: `reportCallEnded(id, 'remoteEnded'/'declinedElsewhere')` with `CallEndedReason` (#6) so the system UI ends with the right reason, plus the transient "Call ended" notification state (#12). Multi-device: `answeredElsewhere`/`declinedElsewhere` (#6). |
| **Handle hang up** | The `endCall()` (local user) vs `reportCallEnded(reason)` (remote/server signal) split (#6); terminal events embed the full session (#14) so the hang-up handler has `serverCallId` without extra state; outgoing/incoming timeouts (#3) as the safety net when the socket dies mid-call. |
| **Handle call on-hold** | `setHeld` + `SetHeldActionEvent` + `isOnHold` on the session (#16) — including Android's `onSetActive`/`onSetInactive` mapping so a cellular call auto-holds the VoIP call and JS can pause media + tell the server. |
| **"Almost production-ready example"** | FCM service coexistence (#7) — without it, any consumer app that also shows normal notifications breaks; answer/connect handshake (#1) so a failed room-join doesn't leave a phantom "connected" call; dedup (#4); their example's `useCallSession` / pending-`requestId` hook patterns (#14, #1). |

---

## Keep (things we have that expo-callkit-telecom lacks)

Don't regress these while adopting the above:
- Swipe-to-answer custom full-screen `IncomingCallActivity`.
- Foreground service with `mediaProjection` type → screen share during calls.
- React warm-up on FCM push (`PushNotificationService.warmUpReact()`).
- Telecom-owned audio-routing replay for cold starts
  (`CallManager.setAudioOutputManager`).

Both Android sides use Jetpack
[core-telecom](https://developer.android.com/jetpack/androidx/releases/core-telecom),
so ports are mostly straightforward.
