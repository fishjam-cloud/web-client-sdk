# Plan: a decline reaches the caller even when the app is killed

Expands [FEATURE-IDEAS.md](./FEATURE-IDEAS.md) item **#5 "Killed-app decline broadcast (Android)"**,
and widens it: the same class of bug exists on iOS, where expo-callkit-telecom has no answer either.

Depends on item **#4** (`serverCallId` + opaque `metadata` in the push payload) — without a way to
identify the call and authenticate the decline with zero app-side state, none of this can talk to a
backend.

---

## Problem

The user's phone rings while our app is force-stopped / swiped away. They decline from the
system UI. The caller keeps ringing until their own 60-second outgoing timeout fires, because
nothing ever told the server the call was rejected.

### Android: the event is guaranteed to be lost

1. FCM data push → [`PushNotificationService.onMessageReceived`](../../../packages/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/voip/PushNotificationService.kt) →
   `CallManager.reportIncomingCall` → Core-Telecom rings and `IncomingCallActivity` shows. All native,
   no JS needed. Good.
2. `warmUpReact()` starts the React **context**, so the JS bundle loads and `WebRTCModule` is
   constructed (which is what attaches `TelecomController` as the `CallEventsListener`). But nothing
   mounts an RN **root view** — `IncomingCallActivity` is a plain `Activity`, not a `ReactActivity` —
   so the app's component tree never renders and the `useVoIPEvents` call inside
   [`VoipProvider.tsx:233`](./app/src/voip/VoipProvider.tsx) never subscribes.
3. User declines → Telecom `onDisconnect` → `CallManager` → `TelecomController.onEnded("rejected")` →
   `webRTCModule.sendEvent("telecomActionPerformed", …)` → emitted into a live JS runtime with **zero
   subscribers**. Silently dropped.

So warm-up buys us a fast answer path (the answer launches the host activity, which mounts React);
it does nothing for a decline, where no activity is ever launched. This is the worst shape of bug:
everything looks healthy, the event just evaporates.

### iOS: mostly works, with a real race

PushKit launches the app process for a VoIP push, and RN builds and mounts the root view during
`didFinishLaunchingWithOptions` even for a background launch — so the React tree **does** mount and
`useVoIPEvents` **does** subscribe. Decline →
[`performEndCallAction`](../../../packages/react-native-webrtc/ios/RCTWebRTC/CallKitManager.m) →
`onCallEnded(@"local")` → JS hears it. Two holes remain:

- **Cold-start race:** the JS bundle takes ~1–3 s. A decline inside that window hits an
  `onCallEnded` block whose JS listener isn't subscribed yet. Dropped, no queue.
- **No channel to the server:** even when JS hears it, our only path to the backend is the signaling
  WebSocket opened by the logged-in UI ([`useCallSignaling.ts:91`](./app/src/signaling/useCallSignaling.ts)
  sends `call-rejected`). A cold-started, logged-out-looking process has no socket and no auth state,
  and iOS suspends it seconds after the call ends.

### The server is also blind

`POST /call` in [`server/main.ts:165`](./server/main.ts) fires the push and forgets. The WebSocket is a
dumb relay: the caller only learns of a rejection because the **callee's** app sends `call-rejected`
over its own socket. No server-side call state ⇒ no server-side fallback. Fixing the client without
giving the server a decline endpoint fixes nothing.

---

## How expo-callkit-telecom does it

### Android: broadcast the events that JS can never receive

[`CallEventEmitter.kt`](~/Desktop/expo-callkit-telecom/android/src/main/java/expo/modules/callkittelecom/events/CallEventEmitter.kt)
is a single chokepoint for every native→JS event, and it has three tiers:

1. JS is observing this event → send it.
2. JS is not observing, but the event has a queue limit > 0 → queue it, flush on `startObserving`
   with `meta: { flushed: true }`.
3. JS is not observing **and** the queue limit is `0` → the event is **dropped** and will never reach
   JS. Exactly these events get a package-internal broadcast instead.

Terminal events (`onCallEnded`, `onCallReportedEnded`) sit in tier 3 deliberately: replaying a stale
"call ended" on the next app launch is useless, so they're never queued — which is precisely what
makes them broadcastable without risking double-delivery.

The broadcast is `Intent(ACTION_CALL_EVENT).setPackage(pkg)` with two extras: `eventName`, and
`payload`, a JSON string of the exact body JS would have received. For terminal events that body
embeds the **full session**, including `serverCallId` and the push `metadata` — so the receiver has
the backend ids and any auth token with **zero app-side state**. Failures are warn-logged and
swallowed; a dead broadcast must never break event emission.

The host app registers a manifest `<receiver>` whose class name comes from the config-plugin prop
`androidEventReceiver`. Their example
([`CallEndedReceiver.kt`](~/Desktop/expo-callkit-telecom/example/client/plugins/CallEndedReceiver.kt))
filters `eventName == "onCallEnded"`, digs out `session.incomingCallEvent.serverCallId` + `metadata`,
and calls `goAsync()` so the (possibly freshly cold-started) process survives past `onReceive` while
it does its work. Their test-push script demos the auth story directly:
`--metadata '{"declineToken":"abc"}'`.

Documented in their [`docs/platform-notes.md`](~/Desktop/expo-callkit-telecom/docs/platform-notes.md)
under "Call ended while the app is killed".

### iOS: they don't solve it

`onCallEnded` is queue-limit `0` on iOS too
([`AppDelegateSubscriber.swift:19-25`](~/Desktop/expo-callkit-telecom/ios/AppDelegateSubscriber.swift) only
raises limits for `CallIntentReceived`, `AudioSessionActivated/Deactivated`, `IncomingCallReported`,
`CallAnswered`, `VoIPPushTokenUpdated`), and there is no broadcast path on iOS. They rely on PushKit
having launched the app so JS is up in time. The fast-decline race is unhandled — same as ours.

---

## Design for our repo

Guiding constraint: **the SDK must not do networking.** It doesn't know the backend, and taking a URL
out of a push payload and POSTing to it would be an SSRF footgun. The SDK's job is to surface the
event to app-owned native code that can run without JS; the app does the HTTP call.

Three layers. Layer 0 is a hard prerequisite; layers 1 and 2 are independent of each other.

### Layer 0 — give the decline something to say (needs #4)

- **Push payload** (#4): server mints `serverCallId` and a short-lived `declineToken` at
  `POST /call` time and puts both in the FCM data / APNs payload under the opaque `metadata`. Native
  keeps them on the call so they're readable with no JS and no app state.
- **Server:** new `POST /call/:serverCallId/decline` (bearer `declineToken`), which looks up the
  caller and pushes `call-rejected` down the **caller's** socket. The server, not the callee's
  process, becomes the thing that notifies the caller. Make it **idempotent on `serverCallId`** —
  layers 1/2 can race with a live JS handler.
- **Server-side safety net (recommended anyway):** once the server knows a call exists, it can also
  expire it on its own. That is the real backstop; the decline path just makes it _instant_ instead
  of _eventually_.

### Layer 1 (Android) — broadcast terminal events that no JS listener can hear

The decision has to be "**is a JS listener subscribed?**", not "is React alive?" — our warm-up makes
React alive while the tree is unmounted, which is exactly the case that currently loses the event.
`WebRTCModule.sendEvent` already bails on `!ctx.hasActiveReactInstance()`
([`WebRTCModule.java:182-184`](../../../packages/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/WebRTCModule.java)),
which is necessary but not sufficient.

Luckily the hook is already there and empty: RN requires `addListener(String)` /
`removeListeners(Integer)` on any `NativeEventEmitter` module, and ours are no-op stubs at
[`WebRTCModule.java:1687`](../../../packages/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/WebRTCModule.java)
and `:1702`. Make them maintain a per-event subscriber count.

1. **Subscriber counting** — `addListener` increments, `removeListeners(count)` decrements. RN's
   `removeListeners` only passes a _count_, not the event name, so keep a total-per-emitter counter
   plus a per-event map populated in `addListener`; on `removeListeners` decrement the total and, if
   it hits 0, clear the map. Coarse but sufficient: the only question we ask is "could anyone hear a
   `telecomActionPerformed`?"
2. **New `voip/CallEventBroadcaster.kt`** — `broadcast(context, eventName, payloadJson)` building
   `Intent(ACTION_CALL_EVENT).setPackage(pkg)` + `eventName`/`payload` extras. Swallow + log failures.
   Action constant: `com.oney.WebRTCModule.ACTION_CALL_EVENT`.
3. **Wire it in `TelecomController.onEnded` / `onFailed` only.** Terminal events are the only ones
   worth broadcasting: `started`/`answer`/`muteChanged`/`holdChanged` are meaningless to a JS-less
   process (and `answer` already launches the host app, which mounts React). If there's no live
   subscriber → broadcast instead of `sendEvent`. Never both.
4. **Payload:** `{ event: "ended", reason, roomName, displayName, serverCallId, metadata }` — same
   shape JS gets, plus the #4 fields, so the receiver needs no state.
5. **Config plugin:** new `androidEventReceiver` prop in
   [`plugin/src/types.ts`](../../../packages/mobile-client/plugin/src/types.ts) →
   `withFishjamVoipAndroid` writes
   `<receiver android:name="…" android:exported="false"><intent-filter><action android:name="com.oney.WebRTCModule.ACTION_CALL_EVENT"/></intent-filter></receiver>`.
6. **Example app:** ship `plugins/CallEndedReceiver.kt` + a `withCallEndedReceiver` plugin that copies
   it into the generated project. In `onReceive`: filter `reason == "rejected"` (and `"missed"`, so the
   caller stops ringing on a timeout too), then **enqueue a `WorkManager` job** rather than POSTing
   inline. A `BroadcastReceiver` — even with `goAsync()` — only gets ~10 s and no retry; a
   killed-app decline is exactly when the network is likeliest to be cold. WorkManager gives us
   retry/backoff for free and survives the process dying again. (Their example POSTs inline from
   `goAsync()`; fine for a demo, not for "almost production-ready".)

**Rejected alternative — HeadlessJS.** `HeadlessJsTaskService` would let the decline be handled in TS
instead of Kotlin. Rejected: a much heavier runtime dependency for one HTTP POST, it must start
within the FCM/foreground-service start window, and its standing on bridgeless/new-arch needs
verifying (see Open questions). Not worth it when the receiver is ~30 lines.

### Layer 2 (iOS) — close the cold-start race, symmetrically

Queue-and-replay is the wrong tool: replaying a "call ended" on the next launch tells the app
something it can no longer act on. Mirror the Android design instead — surface the event to
app-owned native code when JS can't hear it.

`WebRTCModule` is an `RCTEventEmitter`
([`WebRTCModule.h:34`](../../../packages/react-native-webrtc/ios/RCTWebRTC/WebRTCModule.h)), so we get
subscriber tracking **for free**: `RCTEventEmitter` flips `self.hasListeners` in
`startObserving`/`stopObserving`. No new plumbing.

1. In the `onCallEnded` path, if `!self.hasListeners` → post an
   `NSNotification` (`FishjamVoipCallEventUndelivered`) carrying the same dictionary, instead of the
   JS event. The app observes it from its `AppDelegate` (or a small local module) and does the POST.
2. Wrap it in
   [`beginBackgroundTaskWithExpirationHandler`](<https://developer.apple.com/documentation/uikit/uiapplication/beginbackgroundtask(expirationhandler:)>)
   before posting and end it when the app calls a new `voipEventHandled()` bridge method (or after a
   short deadline) — otherwise iOS suspends the process the moment the call tears down and the
   request never leaves the device.
3. Same for the **live-JS** path, honestly: JS `fetch()` after a decline in a background-launched app
   is equally racing suspension. The background-task wrapper should cover both — begin it on
   `onCallEnded` regardless, end it when the app confirms.

This gives one conceptual shape on both platforms: _terminal event + no JS listener → hand it to
app-owned native code + keep the process alive long enough to deliver._

---

## What the user actually sees, after

Killed app, decline on the lock screen → receiver/notification fires within ~100 ms → app POSTs the
decline (token from the push) → server pushes `call-rejected` to the caller's socket → the caller's
ring stops immediately instead of after 60 s.

---

## Implementation checklist

**Prerequisite (#4)**

- [ ] `serverCallId` + opaque `metadata` in the push payload, kept on the native call
- [ ] Server: mint `serverCallId` + `declineToken` in `POST /call`
- [ ] Server: `POST /call/:serverCallId/decline`, idempotent, notifies the caller's socket

**Android**

- [ ] Subscriber counting in `WebRTCModule.addListener` / `removeListeners`
- [ ] `voip/CallEventBroadcaster.kt` + `ACTION_CALL_EVENT`
- [ ] `TelecomController.onEnded` / `onFailed`: broadcast when no subscriber, else `sendEvent` (never both)
- [ ] Config plugin: `androidEventReceiver` prop → manifest `<receiver>`
- [ ] Example: `CallEndedReceiver.kt` → WorkManager job → decline POST

**iOS**

- [ ] `FishjamVoipCallEventUndelivered` notification when `!self.hasListeners`
- [ ] Background task around the `onCallEnded` path + `voipEventHandled()` bridge method
- [ ] Example: `AppDelegate` observer → decline POST

**Docs**

- [ ] README: killed-app decline section; push-payload fields; the `androidEventReceiver` prop

## Verification

- **Android, force-stopped:** `adb shell am force-stop <pkg>`, send a push, decline from the
  full-screen activity **and** (separately) from the notification. Watch
  `adb logcat -s CallEndedReceiver` + the server log. Repeat with the app swiped from Recents and
  with the screen locked.
- **iOS, killed:** kill from the app switcher, push, decline from the CallKit lock-screen UI. Confirm
  the server sees the decline. Then the race: decline **within ~1 s** of the ring starting — this is
  the case that fails today.
- **Regression (both):** app in the foreground → decline must go through JS only. The server must see
  exactly **one** decline, not two. Assert on the server, not just the client.
- **Missed call:** let it ring out to the 45 s native timeout with the app killed — the caller should
  also stop ringing (this is why the receiver handles `missed`, not just `rejected`).

## Open questions

- **Does `removeListeners(count)` give us enough to avoid a stuck non-zero count** across an RN
  reload? If the count leaks upward we'd stop broadcasting (we'd think JS is listening). Consider
  resetting it in `TelecomController.detach()` / on catalyst-instance destroy.
- **HeadlessJS on new arch / bridgeless** — viable or not? Only matters if we ever want the decline
  handled in TS.
- **Does the broadcast survive Doze / battery restrictions** when the process was started by a
  high-priority FCM push? Expected yes (same process, delivered right after `onDisconnect`, and the
  FCM start exemption is still in effect), but it needs a real device test on a locked, dozing phone.
- **Should the server own call lifecycle entirely** (FCE-3435 asks for "make the server aware of the
  call")? If it does, a server-side ring timeout is a strictly better backstop, and the client-side
  decline becomes a latency optimization rather than the only mechanism. Worth deciding before
  building layer 1.
