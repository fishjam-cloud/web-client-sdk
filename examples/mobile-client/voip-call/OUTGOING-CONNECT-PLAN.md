# Plan: real outgoing-call connection reporting

> Companion to [FEATURE-IDEAS.md](./FEATURE-IDEAS.md) item #2 (P0 🔴), ported from
> `~/Desktop/expo-callkit-telecom` (source verified 2026-07-10) and mapped onto our
> ObjC/Kotlin/Java code.
>
> **The dialtone is explicitly out of scope** — see [Deliberately omitted](#deliberately-omitted-the-dialtone)
> for what that costs and where it would hook in later.
>
> Sibling plan: [ANSWER-HANDSHAKE-PLAN.md](./ANSWER-HANDSHAKE-PLAN.md) (item #1). The two
> converge on a shared "mark the call connected" path — read the [Symmetry](#symmetry-with-the-answer-handshake-1)
> section before implementing either in isolation.

## Problem

### iOS: the timer starts when we dial, not when they answer

```objc
// packages/react-native-webrtc/ios/RCTWebRTC/CallKitManager.m:80-81
[weakSelf.provider reportOutgoingCallWithUUID:uuid startedConnectingAtDate:[NSDate date]];
[weakSelf.provider reportOutgoingCallWithUUID:uuid connectedAtDate:[NSDate date]];
```

Both reports fire back-to-back inside the `requestTransaction` completion — i.e. the instant
CallKit *accepts* the call, not when the remote party picks up.
[`reportOutgoingCall(with:connectedAt:)`](https://developer.apple.com/documentation/callkit/cxprovider/reportoutgoingcall(with:connectedat:))
is what starts the system call timer, so the dynamic island / status bar / lock screen counts
from dial time. A 20-second ring becomes 20 seconds of phantom call duration.

Separately, `provider:performStartCallAction:` (`CallKitManager.m:148-150`) is a bare
`[action fulfill]`. The `startedConnecting` report belongs *there* — that is where Apple's own
sample code and the reference put it.

### Android: Telecom is honest, the notification is not

Our Core-Telecom state is already close to correct. `setActive()` is only sent when JS calls
`setTelecomCallActive()` (`voip/CallManager.kt:84`), which the example does from its
`remotePeers.length > 0` effect. Nothing marks the call active at dial time.

The lie is in the notification. `register()` posts the ongoing notification immediately for
outgoing calls:

```kotlin
// voip/CallManager.kt:172-173
if (isIncoming) callNotificationManager.showIncoming(...)
else showOngoingNotification()          // ← at dial time
```

`showOngoingNotification()` → `ForegroundServiceController.onCallStarted(...)`, which sets
`callConnectedAtMs = System.currentTimeMillis()`
(`foregroundService/ForegroundServiceController.java:123-128`). That timestamp reaches
`CallNotificationManager.ongoingBuilder`, which does
`.setUsesChronometer(true).setWhen(connectedAtMs)` (`voip/CallNotificationManager.kt:137-138`).
So the shade shows a running call timer and the text "Ongoing call" while the callee's phone is
still ringing.

So: **iOS reports connected too early to CallKit; Android renders connected too early in the
notification.** Same bug, two surfaces, two different fixes.

## How expo-callkit-telecom does it

### iOS

`startedConnecting` is reported from the delegate, and the timeout starts there too
(`CallManager+CXProviderDelegate.swift:30-54`):

```swift
func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
  provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date())
  startCallTimeout(for: action.callUUID, timeout: Self.outgoingCallTimeout)
  Task {
    await store.updateStatus(for: action.callUUID, status: .connecting)
    await MainActor.run { CallEventEmitter.shared.send(OutgoingCallStartedEvent(id: action.callUUID)) }
  }
  action.fulfill()
}
```

`connectedAt` is reported only when the app asks (`CallManager.swift:502-520`):

```swift
func reportOutgoingCallConnected(for id: UUID) async {
  DialtonePlayer.shared.stop()
  cancelCallTimeout(for: id)
  let now = Date()
  provider.reportOutgoingCall(with: id, connectedAt: now)
  await store.update(for: id) { $0.status = .connected; $0.connectedAt = now }
}
```

### Android

`startOutgoingCall` posts a **dialing** notification inside the `addCall` scope
(`CallManager.kt:275-296`): status `CONNECTING`, `CallNotificationManager.showDialingCall(...)`,
speaker endpoint for video, `DialtonePlayer.play(context)`, emit `OUTGOING_CALL_STARTED`, then
`startCallTimeout(id, outgoingCallTimeoutMs)`. No `setActive()`.

`reportOutgoingCallConnected(id)` (`CallManager.kt:437-451`) is what promotes it: stop dialtone,
cancel timeout, status `CONNECTED` + `connectedAt`, `actions.setActive.trySend(Unit)`, and
`showOngoingCall(context, id, callerName, now.toEpochMilli())` — the chronometer notification,
posted with the *real* connect timestamp.

Note the Android `reportOutgoingCallConnected` body is **line-for-line the same shape** as their
`fulfillIncomingCallConnected` (`CallManager.kt:417-433`): `setActive` + swap to the ongoing
notification. That is the symmetry our plan should preserve.

The JS surface is a single `reportOutgoingCallConnected(id)` (`src/Calls.ts:580-582`) that hits
the identically-named native function on both platforms.

## Design for our repo

We are single-call, so no id parameter is needed — `reportOutgoingCallConnected()` operates on
`currentCallUUID` (iOS) / the one active `CallManager` call (Android), exactly as
`endCallKitSession()` / `endTelecomCall()` already do.

### JS API (new)

In `packages/react-native-webrtc/src/VoIP.ts`, re-exported from `src/index.ts` and
`packages/mobile-client/src/index.ts`:

```ts
/**
 * Reports that an outgoing call's media is connected — the remote party answered.
 * Until this is called, the OS shows the call as "Calling…" / "Dialing…" and no
 * call timer runs. No-op for incoming calls.
 */
export function reportOutgoingCallConnected(): Promise<void>;
```

`setTelecomCallActive()` / `useTelecom().setCallActive` become an implementation detail of this
function. Both are currently public (`src/Telecom.ts:32-37`, re-exported via
`packages/mobile-client/src/index.ts`), so **deprecate rather than delete**: keep the export,
have it delegate to the new native path, and mark it `@deprecated — use reportOutgoingCallConnected()`.
It is Android-only and no-ops on iOS today, which is precisely the platform seam this change
removes.

### iOS implementation

**Track the direction.** `CallKitManager` sets `currentCallUUID` from *both*
`startCallWithDisplayName:` (line 53) and `reportIncomingCallWithDisplayName:` (line 86), and
nothing distinguishes them. Calling `reportOutgoingCall(with:connectedAt:)` on an incoming call
is CallKit misuse, so add the flag first:

```objc
// CallKitManager.h — internal state, exposed read-only for the guard
@property(nonatomic, readonly) BOOL isOutgoingCall;
- (void)reportOutgoingCallConnected;
```

Set `_isOutgoingCall = YES` in `startCallWithDisplayName:`, `NO` in
`reportIncomingCallWithDisplayName:`, and `NO` in `cleanup` (alongside `isCallAnswered`).

**Move `startedConnecting` into the delegate** (`CallKitManager.m:148-150`):

```objc
- (void)provider:(CXProvider *)provider performStartCallAction:(CXStartCallAction *)action {
    [provider reportOutgoingCallWithUUID:action.callUUID startedConnectingAtDate:[NSDate date]];
    [action fulfill];
}
```

**Delete line 81** (the premature `connectedAtDate:`) and line 80 (now redundant — it moved into
the delegate). The completion block keeps only its error handling and `onCallStarted()`.

**Add the reporter:**

```objc
- (void)reportOutgoingCallConnected {
    NSUUID *uuid = self.currentCallUUID;
    if (uuid == nil || !self.isOutgoingCall) {
        NSLog(@"[CallKitManager] No outgoing call to report as connected");
        return;
    }
    [self.provider reportOutgoingCallWithUUID:uuid connectedAtDate:[NSDate date]];
}
```

**Bridge** (`WebRTCModule+CallKit.m`, next to `endCallKitSession`):

```objc
RCT_EXPORT_METHOD(reportOutgoingCallConnected:(RCTPromiseResolveBlock)resolve
                                     rejecter:(RCTPromiseRejectBlock)reject)
```

**Ordering constraint.** CallKit ignores a `connectedAt` report for a call it has not seen
`startedConnectingAt` for, and ignores both before the `CXStartCallAction` is fulfilled. Our JS
flow is safe by construction: `VoipProvider.startCall()` awaits `startCallKitSession(to)` — whose
promise resolves in the transaction completion, i.e. *after* the delegate ran and fulfilled — and
only then joins the room. The `currentCallUUID == nil` guard covers the rest.

### Android implementation

**Track the direction.** `CallManager.register()` already receives `direction`; store it:
`@Volatile private var isOutgoing = false`, set from
`direction == CallAttributesCompat.DIRECTION_OUTGOING`, cleared in the `finally` block (line 200)
next to `hasActiveCall = false`.

**Dial with a connecting notification** (`CallManager.kt:172-173`):

```kotlin
if (isIncoming) callNotificationManager.showIncoming(ctx.applicationContext, displayName, isVideo)
else showConnectingNotification()      // "Dialing…", no chronometer
```

**Promote on connect** — one shared private helper, because this is the exact body that
[ANSWER-HANDSHAKE-PLAN.md](./ANSWER-HANDSHAKE-PLAN.md)'s `fulfillAnswered()` also needs:

```kotlin
/** Telecom goes active and the shade switches to the chronometer notification. */
private fun markConnected() {
    setCallActive()                 // actions.trySend(CallAction.Activate)
    showOngoingNotification()       // ForegroundServiceController.onCallConnected()
}

fun reportOutgoingCallConnected() {
    if (!hasActiveCall || !isOutgoing) return
    markConnected()
}
```

**The foreground service must learn a second state.** `ForegroundServiceController.onCallStarted`
conflates "a call exists" with "the call connected at *now*" (it sets `callConnectedAtMs` in the
same breath, line 126). Split it:

```java
// ForegroundServiceController.java
public synchronized void onCallStarted(String displayName, boolean isVideo) {
    callActive = true;
    callDisplayName = displayName != null ? displayName : "";
    callIsVideo = isVideo;
    callConnectedAtMs = 0L;          // ← 0 == not connected yet
    applyState();
}

public synchronized void onCallConnected() {
    if (!callActive) return;
    callConnectedAtMs = System.currentTimeMillis();
    applyState();
}
```

`applyState()` already re-issues `startService(...)` with fresh extras, and
`WebRTCForegroundService.onStartCommand` re-`startForeground()`s with a rebuilt notification, so
this is an in-place notification update with no new plumbing. The FGS type set
(`microphone`, plus `camera` for video) is unchanged across the transition — the service starts
at dial time and simply swaps its notification, which keeps us clear of
[foreground-service background-start restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start).

`WebRTCForegroundService.java:58-62` then branches on the sentinel:

```java
long connectedAt = intent.getLongExtra("voipConnectedAt", 0L);
Notification notification = connectedAt > 0
        ? callNotificationManager.buildOngoing(this, voipDisplayName, connectedAt)
        : callNotificationManager.buildConnecting(this, voipDisplayName, /* isOutgoing */ ...);
```

**`CallNotificationManager.buildConnecting(...)`** reuses `callNotificationBuilder(ctx,
CHANNEL_ONGOING, displayName, text)` with `text = "Dialing…"` and
[`CallStyle.forOngoingCall(person, hangupPendingIntent)`](https://developer.android.com/reference/androidx/core/app/NotificationCompat.CallStyle#forOngoingCall(androidx.core.app.Person,android.app.PendingIntent))
— there is no dedicated "dialing" CallStyle; `forOngoingCall` is the correct one, it just gets a
hangup action and **no** `setUsesChronometer(true)` / `setWhen(...)`. Omitting the chronometer is
the entire fix. (Item #12 wants "Dialing…" for outgoing and "Connecting…" for a freshly answered
incoming call; pass the string in so both plans share this builder.)

**Bridge**: `WebRTCModule.java` gains `reportOutgoingCallConnected(Promise)` next to the existing
telecom block (lines 1707-1733), routed through `TelecomController.reportOutgoingCallConnected()`
with the usual `Build.VERSION.SDK_INT >= O` guard.

**Side effect worth noting:** `onSetActive = { answered = true }` (`CallManager.kt:168`) means the
Android `answered` flag now flips at real connect time for outgoing calls rather than whenever JS
happened to call `setTelecomCallActive()`. That is strictly more correct and matches the flag's
`isTelecomCallAnswered()` contract.

### Symmetry with the answer handshake (#1)

After both plans land, "the call is really up" has exactly one meaning per platform and one
entry point per direction:

| | incoming | outgoing |
| --- | --- | --- |
| JS calls | `fulfillIncomingCallConnected(requestId)` | `reportOutgoingCallConnected()` |
| iOS does | `action.fulfill()` on the parked `CXAnswerCallAction` | `reportOutgoingCall(with:connectedAt:)` |
| Android does | `markConnected()` | `markConnected()` |

Land #1 first if you are doing both: it introduces `showConnectingNotification()` and the
`markConnected()` split, and this plan then reduces to the iOS reporting fix plus the `isOutgoing`
guard. Landing #2 first is also fine — it introduces the same two helpers — but do not build them
twice.

### Example app (`app/src/voip/VoipProvider.tsx`)

The `remotePeers` effect (lines 184-201) is already the "media is live" signal, and for an
outgoing call `remotePeers.length > 0` means precisely *the callee joined the room* — the answer
event we never had. It becomes direction-aware and stops being platform-conditional:

```tsx
if (status === 'connecting' && remotePeers.length > 0) {
    const call = currentCallRef.current;
    if (call?.isOutgoing) {
        await reportOutgoingCallConnected();
    } else if (pendingRequestIdRef.current) {          // from ANSWER-HANDSHAKE-PLAN
        const connected = await fulfillIncomingCallConnected(pendingRequestIdRef.current);
        pendingRequestIdRef.current = null;
        if (!connected) { await endCall(); return; }
    }
    setStatus('active');
    // ...startedAt bookkeeping unchanged — it now agrees with the OS timer
}
```

The Android-only `setTelecomCallActive()` call goes away. `currentCall.isOutgoing` already exists
(`VoipContext.ts`, set in `startCall`), and `OutgoingCallScreen` already renders for
`status === 'connecting'`, so the app-side "ringing" UI needs no work.

`startedAt` is currently stamped in this effect and drives the in-app call duration; it now lines
up with the OS timer to within a render, instead of trailing it by the whole ring duration.

## Deliberately omitted: the dialtone

Per the request, no `DialtonePlayer`. What that costs and where it would go:

- **Cost:** during `status === 'connecting'` on an outgoing call the earpiece is silent. The user
  gets no audible confirmation that the callee's phone is ringing — only `OutgoingCallScreen`.
  This makes the in-app ringing UI load-bearing rather than decorative, and it makes the missing
  outgoing timeout (below) more noticeable, since silence and "callee never picked up" are
  indistinguishable to the ear.
- **Where it would hook, if added later:** iOS from `provider:didActivateAudioSession:`
  (`CallKitManager.m:186-188`) gated on `isOutgoingCall && !isConnected` — the reference gates on
  exactly that predicate (`session.origin == .outgoingApp && session.status == .connecting`) —
  and stopped in `reportOutgoingCallConnected`, `endCall`, and the timeout handler. Android from
  the `addCall` scope at dial time, stopped in `markConnected()` and the `finally` block.
- The `isOutgoingCall` flag and the connecting/connected split this plan introduces **are** that
  predicate. Nothing here needs redoing to add sound later; it is a `play()`/`stop()` pair at four
  call sites.

## Regression risk: an unanswered outgoing call now hangs forever

Read this before shipping. Today the instant `connectedAt` report at least made the system UI
settle into a stable (wrong) state. After this change, an outgoing call that is never answered
displays "Calling…" indefinitely: CallKit will not time it out, and our Android side has no timer
either.

The example app doesn't save us. Its only teardown paths are `status === 'active' && remotePeers.length === 0`
(never reached, since we never became active) and the user hanging up.

The reference handles this with **FEATURE-IDEAS item #3** — a 60 s outgoing timeout started in
`performStartCallAction` / the `addCall` scope, ending the call with reason `unanswered`. That
item is a much smaller job than #3's full three-timeout story: this plan only needs the outgoing
one, and it needs nothing from the dialtone.

**Recommendation: land [CALL-TIMEOUTS-PLAN.md](./CALL-TIMEOUTS-PLAN.md) Steps 1–5 first, then
ship this plan together with its Step 6.** That plan (written after this one) carries the full
timeout design — cancellable `dispatch_block_create` timer with a wall clock on iOS, coroutine
`Job` on Android, `FishjamVoip*Timeout` config keys (same key name in Info.plist *and* manifest
meta-data), default 60 s — and its Step 6 is exactly the iOS outgoing timer this section needs:
start in `provider:performStartCallAction:`, cancel in `reportOutgoingCallConnected` + `cleanup`.
With Steps 1–5 already merged, Step 6 is a ~15-line addition to this PR because the timer
infrastructure, config reads, and the Android outgoing timeout all exist.

Two corrections to what this section previously claimed:
- No dependency on item #6 for the *unanswered* label: `endCallWithReason:@"missed"` already maps
  to `CXCallEndedReasonUnanswered` (`CallKitManager.m:123-124`), so expiry via the existing
  end-call path labels the call correctly today.
- The config reader helpers come from CALL-TIMEOUTS-PLAN Step 3, not ANSWER-HANDSHAKE-PLAN (the
  handshake shipped with a hardcoded 10 s deadline and no readers).

If you nevertheless ship #2 without any timeout, say so in the example's README and file #3 as a
follow-up — do not leave it undiscovered.

## Scope note: Recents

FEATURE-IDEAS #2 cites "correct call duration in the dynamic island / status bar / Recents".
Recents is **not** a benefit you will observe from this change alone: we set
`providerConfiguration.includesCallsInRecents = NO` (`CallKitManager.m:33`), so our calls never
reach the Recents list. Flipping that flag is item #11. The immediately visible wins here are the
dynamic island, the status-bar pill, the lock-screen call UI, and the Android shade.

## Implementation checklist

- [ ] `ios/RCTWebRTC/CallKitManager.h` — `isOutgoingCall` readonly property;
      `- (void)reportOutgoingCallConnected;`
- [ ] `ios/RCTWebRTC/CallKitManager.m` — set/clear `_isOutgoingCall` in
      `startCallWithDisplayName:` / `reportIncomingCallWithDisplayName:` / `cleanup`; move
      `startedConnectingAtDate:` into `provider:performStartCallAction:`; **delete both report
      lines from the transaction completion (80-81)**; add `reportOutgoingCallConnected` with the
      `currentCallUUID` + `isOutgoingCall` guard
- [ ] `ios/RCTWebRTC/WebRTCModule+CallKit.m` — `RCT_EXPORT_METHOD(reportOutgoingCallConnected:…)`
- [ ] `android/.../voip/CallManager.kt` — `isOutgoing` flag (set in `register`, cleared in
      `finally`); dial posts `showConnectingNotification()`; `markConnected()` helper;
      `reportOutgoingCallConnected()` guarded on `hasActiveCall && isOutgoing`
- [ ] `android/.../voip/CallNotificationManager.kt` — `buildConnecting(ctx, displayName, text)`:
      `CallStyle.forOngoingCall` + hangup action, **no** `setUsesChronometer`/`setWhen`
- [ ] `android/.../foregroundService/ForegroundServiceController.java` — `onCallStarted` sets
      `callConnectedAtMs = 0`; new `onCallConnected()` stamps it and re-applies state
- [ ] `android/.../foregroundService/WebRTCForegroundService.java` — branch on
      `voipConnectedAt > 0` → `buildOngoing` else `buildConnecting`
- [ ] `android/.../TelecomController.java` + `WebRTCModule.java` —
      `reportOutgoingCallConnected(Promise)` with the API-26 guard
- [ ] `src/Telecom.ts` — `reportOutgoingCallConnected()` wrapper; mark `setTelecomCallActive`
      `@deprecated` and delegate to it
- [ ] `src/useTelecom.ts` — same deprecation note on `setCallActive`
- [ ] `src/VoIP.ts` — cross-platform `reportOutgoingCallConnected()`
- [ ] `src/index.ts` + `packages/mobile-client/src/index.ts` — re-export
- [ ] `examples/.../app/src/voip/VoipProvider.tsx` — direction-aware `remotePeers` effect; drop
      the Android-only `setTelecomCallActive()`
- [ ] `examples/mobile-client/voip-call/README.md` — document the outgoing lifecycle
      (`startCallKitSession` → "Calling…" → `reportOutgoingCallConnected()` → timer starts)
- [ ] **Strongly recommended, same PR:** outgoing timeout (see the regression-risk section)
- [ ] `FEATURE-IDEAS.md` #2 — link here; mark done when it lands

### Verification

- Compile: `JAVA_HOME=~/.sdkman/candidates/java/17.0.18-zulu ./gradlew
  :fishjam-cloud_react-native-webrtc:compileDebugKotlin` (per project memory — the default sdkman
  JDK 26 breaks gradle), plus an iOS build of `examples/mobile-client/voip-call/app`.
- Device checks, two phones, both platforms as caller:
  1. **The headline** — call B from A, let it ring ~15 s, then answer. A's dynamic island / status
     bar timer must read ~0:00 at the moment B answers, not ~0:15. Compare against the in-app
     `startedAt` duration on `InCallScreen`; they should agree. This is the whole point of the
     change and it is only observable on a real device.
  2. **Android shade** — while ringing, pull down the shade: "Dialing…", no running timer, hangup
     button works. After B answers: chronometer starts from 0.
  3. **Declined / never answered** — confirm the caller's UI never shows a running timer, and
     (if the timeout ships) that the call self-terminates at ~60 s.
  4. **Caller hangs up while ringing** — exactly one `ended` event; no chronometer ever appeared;
     FGS stops.
  5. **Incoming calls unaffected** — `reportOutgoingCallConnected()` must be a no-op; verify the
     `isOutgoingCall` / `isOutgoing` guards by calling it from JS during an incoming call and
     confirming nothing changes.
  6. **Android FGS types** — video outgoing call: confirm `camera` + `microphone` types are held
     across the dialing → connected notification swap (`adb shell dumpsys activity services`),
     i.e. the swap does not restart the service into a narrower type set.

## Open questions

- **Does `reportOutgoingCall(with:connectedAt:)` accept a backdated `Date`?** It does for
  `startedConnectingAt`. If it does for `connectedAt` too, the connect timestamp could come from
  the peer-joined event rather than from when the JS round-trip completes, shaving the bridge
  latency off the reported duration. Worth measuring; not required for correctness.
- **Should `reportOutgoingCallConnected()` reject instead of silently no-op'ing** when there is no
  outgoing call? Silent no-op matches `endCallKitSession()`'s existing behaviour
  (`CallKitManager.m:114-117` just logs), so this plan keeps it consistent. Revisit if #14's call
  session model gives JS a way to know the direction before calling.
- **Android "Dialing…" copy** is hardcoded English, like everything else in
  `CallNotificationManager`. Item #12 flags i18n for the whole file; don't solve it here, but put
  the string next to the others so there is one place to fix.
