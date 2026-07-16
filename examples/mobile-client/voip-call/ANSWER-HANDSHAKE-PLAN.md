# Plan: proper answer/connect handshake (fulfill/fail instead of instant-fulfill)

> Companion to [FEATURE-IDEAS.md](./FEATURE-IDEAS.md) item #1 (P0 🔴). That item states the
> gap in two sentences; this file is the full implementation plan, ported from how
> `~/Desktop/expo-callkit-telecom` does it (verified against their source on 2026-07-10).

## Problem

When the user answers an incoming call, our iOS delegate fulfills the `CXAnswerCallAction`
**immediately**:

```objc
// packages/react-native-webrtc/ios/RCTWebRTC/CallKitManager.m:160-166
- (void)provider:(CXProvider *)provider performAnswerCallAction:(CXAnswerCallAction *)action {
    self.isCallAnswered = YES;
    if (self.onCallAnswered) { self.onCallAnswered(); }
    [action fulfill];   // ← "connected" before a single RTP packet exists
}
```

Two consequences:

1. **The system UI lies.** `action.fulfill()` is what tells CallKit the call is up, so the
   dynamic island / lock screen starts its call timer while we are still fetching a peer
   token and joining the Fishjam room. Call duration in the UI is wrong by however long the
   join takes.
2. **A failed join is unreportable.** If `getPeerToken()` 401s or `joinRoom()` throws, the
   `CXAnswerCallAction` is long gone. There is no way to tell CallKit "that answer didn't
   work" — the call sits in the system UI as connected and silent. Today
   `VoipProvider.answerCall()` catches the error and calls `endCall()`
   (`examples/mobile-client/voip-call/app/src/voip/VoipProvider.tsx:144-155`), which reads to
   the user as *"the call connected and then instantly dropped"* rather than *"the call
   failed"*.

Android has the mirror problem in a different shape: `handleAnswered()` posts the ongoing
(chronometer) notification the moment the user answers
(`packages/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/voip/CallManager.kt:253-259`),
and nothing ever calls `setActive()` unless JS happens to call `setTelecomCallActive()`
— which the example only does from a `remotePeers.length > 0` effect, with no timeout and no
failure path.

Neither platform has a timeout: if JS never finishes connecting, the call hangs forever.

## How expo-callkit-telecom does it

The answer action is **parked**, not fulfilled. A `FulfillRequestManager` keyed by a
generated `requestId` holds it; JS is handed the `requestId` in the answer event and later
resolves it.

### iOS (`ios/Managers/FulfillRequestManager.swift`, `CallManager+CXProviderDelegate.swift:58-95`)

`FulfillRequestManager` is a Swift `actor` mapping `requestId → PendingRequest { callId,
continuation, timeoutTask }`. `createRequest(callId:timeout:)` returns
`(requestId, Task<Result, Never>)` where `Result` is `.fulfilled(callId:) | .cancelled | .timedOut`.
The delegate literally awaits it:

```swift
func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
  cancelCallTimeout(for: action.callUUID)
  Task {
    await store.updateStatus(for: action.callUUID, status: .connecting)
    let (requestId, resultTask) = await FulfillRequestManager.shared.createRequest(
      callId: action.callUUID, timeout: Self.answerCallTimeout)
    await MainActor.run {
      CallEventEmitter.shared.send(CallAnsweredEvent(id: action.callUUID, requestId: requestId))
    }
    switch await resultTask.value {
    case .fulfilled: action.fulfill()
    case .cancelled: action.fail()
    case .timedOut:  action.fail()
    }
  }
}
```

- `fulfill(requestId:)` cancels the timeout task and resumes `.fulfilled`; returns `nil` if
  the request already timed out (so a late JS call is a safe no-op).
- `cancel(requestId:)` resumes `.cancelled` → `action.fail()`.
- `cancelAll()` runs from `providerDidReset` alongside `DialtonePlayer.stop()`,
  `cancelAllCallTimeouts()` and `store.removeAll()`.
- Timeout is read from the Info.plist key `ExpoCallKitTelecomFulfillAnswerCallTimeout`
  (seconds, default 30), written by their config plugin.

### Android (`managers/FulfillRequestManager.kt`, `managers/CallManager.kt:812-848`)

Same shape, expressed with coroutines: a `mutableMapOf<UUID, UUID>` (requestId → callId)
plus `timeoutJobs`, both guarded by `synchronized(lock)`. `createRequest` takes an
`onTimeout: (UUID) -> Unit` callback rather than returning a result — `CallManager` passes
`{ reportCallEnded(it, CallEndedReason.FAILED) }`.

`onCallAnswered(id)` — the shared path for both the system answer callback and the in-app
`answerCall(id)` — does: early-return if already `CONNECTED`, cancel the incoming-call
timeout, set status `CONNECTING`, activate audio, request the speaker endpoint for video
calls, create the fulfill request, then emit `CALL_ANSWERED` with `{ id, requestId }`.

`fulfillIncomingCallConnected(requestId)` is where the call actually goes live:

```kotlin
fun fulfillIncomingCallConnected(requestId: UUID): Boolean {
    val callId = FulfillRequestManager.fulfill(requestId) ?: return false
    val now = Instant.now()
    CallStore.update(callId) { it.copy(status = CONNECTED, connectedAt = now) }
    activeCalls[callId]?.actions?.setActive?.trySend(Unit)      // ← core-telecom goes active here
    CallNotificationManager.showOngoingCall(context, callId, callerName, now.toEpochMilli())
    return true
}
```

There is **no** `failIncomingCallConnected` native function on Android. Their JS shim
(`src/Calls.ts:552-561`) branches instead:

```ts
export async function failIncomingCallConnected(id: string, requestId: string) {
  if (Platform.OS === "ios") {
    await ExpoCallKitTelecomModule.failIncomingCallConnected(requestId);
  } else {
    await ExpoCallKitTelecomModule.reportCallEnded(id, "failed");
  }
}
```

…because on Android "failing" just means disconnecting; `reportCallEnded` internally calls
`FulfillRequestManager.cancelForCall(id)` to reap the orphaned request. Their `endCall` path
does the same. The Android timeout is read from an application `meta-data` int via
`PackageManager.GET_META_DATA` (`readTimeoutMs`, `CallManager.kt:149-161`).

**The asymmetry is inherent, not an accident:** iOS has a first-class `CXAction` object with
`fulfill()`/`fail()` semantics that CallKit itself acts on; Android core-telecom has no
"answer failed" concept, only `setActive()` vs `disconnect()`.

## Design for our repo

Our VoIP layer is **single-call** (`currentCallUUID` is private to `CallKitManager`; the
Android `CallManager` is an `object` with one `hasActiveCall` flag; JS events are payload-keyed
objects with no call id). So we do **not** need to port `CallSession`/`CallStore` (that is
item #14) — the `requestId` is the only correlation handle JS needs, and it doubles as a
generation counter that makes stale fulfills safe.

Three states become distinguishable where today there are two:

| | today | after |
| --- | --- | --- |
| user tapped answer | `isCallAnswered = true`, CallKit says *connected* | `isCallAnswered = true`, CallKit says *connecting* |
| media connected | (same state) | `action.fulfill()` → CallKit says *connected*, timer starts |
| media failed | `endCall()` → looks like a drop | `action.fail()` → CallKit ends it as a failure |

### JS API (new)

Added to the unified layer in `packages/react-native-webrtc/src/VoIP.ts` (which already hosts
the cross-platform push glue), re-exported from `src/index.ts` and
`packages/mobile-client/src/index.ts`:

```ts
/** Resolves the parked answer action; the OS now shows the call as connected.
 *  Returns false if the request already timed out (the call is gone — bail out). */
export function fulfillIncomingCallConnected(requestId: string): Promise<boolean>;

/** Aborts the parked answer action. iOS fails the CXAnswerCallAction (CallKit tears the
 *  call down); Android disconnects. Safe to call after a timeout — no-ops. */
export function failIncomingCallConnected(requestId: string): Promise<void>;

/** The requestId of an answer that is still awaiting fulfillment, or null.
 *  Needed on cold start: the user can answer before the JS bundle is up. */
export function getPendingAnswerRequestId(): string | null;
```

`useVoIPEvents`' handler signature gains the id — additive for existing call sites, which
simply ignore the argument:

```ts
export type VoIPEventHandlers = {
    onIncoming?: (payload: VoipIncomingPayload) => void;
    onAnswered?: (requestId: string) => void;   // was: () => void
    onEnded?: () => void;
    onRegistered?: (token: string) => void;
};
```

Returning `boolean` from `fulfillIncomingCallConnected` (rather than `void` like theirs) is a
deliberate improvement: both native sides already compute "did this request still exist", and
without it JS cannot distinguish *"we connected"* from *"we connected 2 s after the OS gave
up and killed the call"*.

### iOS implementation

**New `ios/RCTWebRTC/FulfillRequestManager.h/.m`** — the ObjC equivalent of their actor. No
Swift concurrency available, so: a serial `dispatch_queue_t` guards the dictionary, and the
timeout is a `dispatch_after` on that same queue whose handler checks whether the request is
still present (exactly the reference's `removeRequest`-returns-nil trick — a `dispatch_after`
cannot be cancelled, so the dictionary *is* the cancellation token).

```objc
typedef NS_ENUM(NSInteger, FulfillResult) {
    FulfillResultFulfilled,
    FulfillResultCancelled,
    FulfillResultTimedOut,
};

@interface FulfillRequestManager : NSObject
+ (instancetype)shared;
/// completion runs exactly once, on the main queue.
- (NSString *)createRequestWithTimeout:(NSTimeInterval)timeout
                            completion:(void (^)(FulfillResult result))completion;
- (BOOL)fulfill:(NSString *)requestId;   // NO if unknown/timed out
- (BOOL)cancel:(NSString *)requestId;
- (void)cancelAll;
@end
```

`requestId` is `NSUUID.UUID.UUIDString`. The completion hops to the main queue because
`CXProvider` was constructed with `[_provider setDelegate:self queue:nil]`
(`CallKitManager.m:36`) — delegate callbacks and action fulfillment belong on the main queue.

**`CallKitManager.h`** — `onCallAnswered` changes from `CallKitVoidCallback` to
`CallKitStringCallback` (carries the `requestId`); add
`@property(nonatomic, readonly, nullable) NSString *pendingAnswerRequestId;` and

```objc
- (BOOL)fulfillIncomingCallConnected:(NSString *)requestId;
- (void)failIncomingCallConnected:(NSString *)requestId;
```

**`CallKitManager.m`** — the delegate parks the action:

```objc
- (void)provider:(CXProvider *)provider performAnswerCallAction:(CXAnswerCallAction *)action {
    self.isCallAnswered = YES;   // semantics unchanged: "the user accepted", not "media is up"

    __weak typeof(self) weakSelf = self;
    NSString *requestId = [[FulfillRequestManager shared]
        createRequestWithTimeout:kFulfillAnswerTimeout
                      completion:^(FulfillResult result) {
            weakSelf.pendingAnswerRequestId = nil;
            if (result == FulfillResultFulfilled) {
                [action fulfill];
            } else {
                [action fail];
                [weakSelf reportAnswerFailureForCall:action.callUUID];
            }
        }];

    self.pendingAnswerRequestId = requestId;
    if (self.onCallAnswered) { self.onCallAnswered(requestId); }
}
```

- The fulfill timeout is a fixed **10 seconds** on both platforms. It is intentionally not
  configurable so every integration has the same answer-to-media deadline.
- `reportAnswerFailureForCall:` is defensive cleanup: `[self.provider reportCallWithUUID:uuid
  endedAtDate:[NSDate date] reason:CXCallEndedReasonFailed]` then `[self cleanup]`, guarded by
  `[uuid isEqual:self.currentCallUUID]` so it is a no-op when the call already ended. The
  reference asserts that `action.fail()` alone makes CallKit issue a `CXEndCallAction`; that
  is not stated anywhere in Apple's docs, so we belt-and-brace it. **Verify on device**: if
  `performEndCallAction:` does fire, the guard makes the second report harmless; if it does
  not, this line is what prevents a stuck call.
- `fulfillIncomingCallConnected:` → `[[FulfillRequestManager shared] fulfill:requestId]`.
- `failIncomingCallConnected:` → `[[FulfillRequestManager shared] cancel:requestId]`.
- `cleanup`, `providerDidReset:` and `performEndCallAction:` call `[[FulfillRequestManager
  shared] cancelAll]` — matching their `providerDidReset`. **Re-entrancy hazard:** `cancelAll`
  synchronously drives the completion → `action.fail()` → `reportAnswerFailureForCall:` →
  `cleanup` → `cancelAll`. The `currentCallUUID` guard above breaks the cycle; null
  `currentCallUUID` *before* calling `cancelAll` in `cleanup`.

**New: `provider:timedOutPerformingAction:`.** CallKit gives every `CXAction` a
[`timeoutDate`](https://developer.apple.com/documentation/callkit/cxaction/timeoutdate) and
calls
[`provider(_:timedOutPerforming:)`](https://developer.apple.com/documentation/callkit/cxproviderdelegate/provider(_:timedoutperforming:))
when it elapses. Apple does not document the duration, and the reference implementation does
not implement this delegate method at all — a latent bug in *their* code that we should not
copy, because the system's own action timeout is undocumented. Implement
it: if the action is a `CXAnswerCallAction`, cancel the pending request (which fails the
action) and report the call ended.

**`WebRTCModule+CallKit.m`** — bridge surface:

```objc
RCT_EXPORT_METHOD(fulfillIncomingCallConnected:(NSString *)requestId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)   // resolves @(BOOL)
RCT_EXPORT_METHOD(failIncomingCallConnected:(NSString *)requestId ...)
RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getPendingAnswerRequestId)  // NSString or nil
```

and the `onCallAnswered` block becomes
`^(NSString *requestId) { [weakSelf sendEventWithName:kEventCallKitActionPerformed body:@{@"answer": requestId}]; }`.
`CallKitAction.answer` therefore changes type from `undefined` to `string` — `useCallKitEvent`
already forwards `payload[action]` untouched (`src/useCallKit.ts:74-76`), so no change there.

### Android implementation

**New `voip/FulfillRequestManager.kt`** — port theirs nearly verbatim (`synchronized(lock)`
map + `timeoutJobs`, `createRequest(timeoutMs, onTimeout)`, `fulfill`, `cancel`, `cancelAll`).
Ours is single-call, so key it by `requestId: String` alone and drop `cancelForCall`.

**`voip/CallManager.kt`**

- Add `@Volatile private var pendingAnswerRequestId: String? = null` and
  `fun pendingAnswerRequestId(): String?` for the bridge.
- `handleAnswered()` (line 253) stops posting the ongoing notification. Instead:

```kotlin
private fun handleAnswered() {
    answered = true
    callNotificationManager.stopVibration()
    appContext?.let { LockScreenController.onCallAnswered(it) }
    showConnectingNotification()                    // ← see FGS note below
    val requestId = FulfillRequestManager.createRequest(FULFILL_ANSWER_TIMEOUT_MS) {
        pendingAnswerRequestId = null
        listener?.onFailed("answer fulfill timed out")
        endCall()                                   // Disconnect(DisconnectCause.LOCAL)
    }
    pendingAnswerRequestId = requestId
    listener?.onAnswered(requestId)
}
```

- New `fun fulfillAnswered(requestId: String): Boolean` — the Android analogue of
  `action.fulfill()`:

```kotlin
fun fulfillAnswered(requestId: String): Boolean {
    if (!FulfillRequestManager.fulfill(requestId)) return false
    pendingAnswerRequestId = null
    setCallActive()                                 // actions.trySend(CallAction.Activate)
    showOngoingNotification()                       // chronometer starts here
    return true
}
```

- New `fun failAnswered(requestId: String)` → `FulfillRequestManager.cancel(requestId)` then
  `endCall()` with `DisconnectCause(DisconnectCause.ERROR)`.
- The `finally` block of `register()` (line 200) gains `FulfillRequestManager.cancelAll()` and
  `pendingAnswerRequestId = null`, next to the existing `VoipPushRegistry.clearPending()`.
- `FULFILL_ANSWER_TIMEOUT_MS` is fixed at `10_000L`, matching iOS.

> ⚠️ **Foreground-service start window — do not naively move `showOngoingNotification()` to
> fulfill.** Ours is not just a notification: `showOngoingNotification()` calls
> `ForegroundServiceController.onCallStarted(...)`
> (`CallManager.kt:261-263`), which starts an FGS with `microphone`/`mediaProjection` types.
> Android only permits an FGS start from the background inside a short window after the
> user-visible event that authorised it; deferring the start by up to 10 s risks
> [`ForegroundServiceStartNotAllowedException`](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start).
> Hence `showConnectingNotification()` **at answer time** (starts the FGS immediately, content
> text "Connecting…", no chronometer) and an `notify()`-level update to the chronometer
> notification on fulfill. This is item #12's "dialing/ended states" arriving early, and it is
> a place where a verbatim port of the reference would be wrong for our repo.

The user-facing side already cooperates: `IncomingCallActivity` shows `buildConnectingUi(...)`
after the swipe (`IncomingCallActivity.kt:111`) and finishes when the host activity covers it,
so the "connecting" phase has a UI on Android without new work.

**`TelecomController.java`** — `CallEventsListener.onAnswered()` becomes
`onAnswered(String requestId)`; the emitted body gains `body.putString("requestId", requestId)`.
`onFailed(reason)` already exists and is reused for the timeout.

**`WebRTCModule.java`** (near the existing telecom block at lines 1707-1733) — add
`fulfillTelecomCallAnswered(String requestId, Promise)` (resolves the `boolean`),
`failTelecomCallAnswered(String requestId, Promise)`, and a blocking-synchronous
`getPendingAnswerRequestId()`.

**Note on `answered`:** `onSetActive = { answered = true }` (line 168) and `handleAnswered()`
both set it, so `answered` means *"the user accepted"*. Keep that meaning — `useVoIPEvents`'
cold-start replay depends on it. "Connected" is now expressed by the fulfill having landed,
not by a flag.

### Cold start — the case the reference under-serves

The user can answer from the lock screen while the JS bundle is still loading. The fulfill
request is created in native at that instant and its clock is already running; the
`onAnswered` event has nobody to reach. expo-callkit-telecom solves this with per-event
queues flushed on `startObserving` (item #15); we already have a narrower version of that
mechanism, and it needs one addition.

`useVoIPEvents`' cold-start branch (`src/useVoIPEvents.ts:81-98`, and the Android twin at
150-167) currently does:

```ts
const pendingCall = getPendingIncomingCall();
if (pendingCall && hasActiveCallKitSession()) {
    assertRoomName(pendingCall);
    handlersRef.current.onIncoming?.(pendingCall as VoipIncomingPayload);
    if (isCallAnswered()) { handlersRef.current.onAnswered?.(); }   // ← no requestId to give
}
```

Change the last line to pull the parked id from native:

```ts
const requestId = getPendingAnswerRequestId();
if (requestId) { handlersRef.current.onAnswered?.(requestId); }
```

`isCallAnswered()` / `isTelecomCallAnswered()` stay as they are (still the honest answer to
"did the user accept?"), but the *replay* is now driven by the presence of an unfulfilled
request, which is strictly more precise: it cannot re-fire for a call that already connected.

Consequences to document:

- The fixed 10 s deadline has to cover **bundle startup + token fetch + room join** on a cold
  start from a killed app, not just the join.
- On iOS the clock starts inside `performAnswerCallAction:`, which the OS may deliver before
  React Native's `startObserving` runs (`WebRTCModule+CallKit.m:46-50` is where the manager is
  first constructed).

### Example app (`examples/mobile-client/voip-call/app/src/voip/VoipProvider.tsx`)

The provider already has the exact shape this handshake wants: it treats
`remotePeers.length > 0` as "media is live" and, on Android only, calls `setTelecomCallActive()`
there (lines 184-201). That effect becomes the fulfill point, and it stops being
platform-conditional — `fulfillIncomingCallConnected` *is* `setActive()` on Android and
`action.fulfill()` on iOS.

```tsx
const pendingRequestIdRef = useRef<string | null>(null);

onAnswered: useCallback(async (requestId: string) => {
    pendingRequestIdRef.current = requestId;
    setStatus('connecting');
    try {
        await handleJoinRoom(call.roomName);
    } catch (err) {
        console.error('Failed to join room on answer:', err);
        await failIncomingCallConnected(requestId);   // ← was: endCall()
        pendingRequestIdRef.current = null;
        resetCallState();                             // endCall() minus the native teardown
    }
}, [handleJoinRoom]),
```

and in the `remotePeers` effect:

```tsx
if (status === 'connecting' && remotePeers.length > 0) {
    const requestId = pendingRequestIdRef.current;
    if (requestId) {
        pendingRequestIdRef.current = null;
        const connected = await fulfillIncomingCallConnected(requestId);
        if (!connected) { await endCall(); return; }   // native already timed out and killed it
    }
    setStatus('active');
    // ...startedAt bookkeeping unchanged
}
```

Two things to get right here:

- **The fail path must not call `endNativeCallSession()`.** `failIncomingCallConnected` already
  ends the native call (iOS via `action.fail()`, Android via `disconnect`). Calling `endCall()`
  on top of it double-reports. Split the current `endCall()` into `resetCallState()` (JS state
  + `handleLeaveRoom()`) and `endCall()` (`resetCallState()` + `endNativeCallSession()`).
- **Outgoing calls have no `requestId`** — `pendingRequestIdRef` is null and the effect skips
  the fulfill, preserving today's behaviour. Making the *outgoing* leg honest is
  FEATURE-IDEAS #2 (`reportOutgoingCallConnected`), which slots into the same effect and shares
  this timeout infrastructure. Land #1 first; #2 is a two-line follow-up on this foundation.

## Edge cases the implementation must handle

| Case | Expected behaviour |
| --- | --- |
| JS fulfills after the native timeout fired | `fulfill` returns `false`; call is already ended; JS bails out via the `!connected` branch |
| JS fulfills twice | second call returns `false` — the map lookup already removed the entry |
| Remote hangs up while we're connecting | `CXEndCallAction` / `onDisconnect` → `cancelAll()` → the parked action fails; the `currentCallUUID` guard suppresses the duplicate end report |
| User answers, then kills the app | `providerDidReset` (iOS) / `finally` block (Android) → `cancelAll()` |
| `fail` called after the request timed out | `cancel` no-ops (returns `false`); the call is already gone |
| Answer arrives before JS is ready | request parked; replayed via `getPendingAnswerRequestId()` on `startObserving` |
| Malformed push → no `roomName` | today `assertRoomName` throws in the cold-start `try` and the answer is swallowed. With this change the parked request now times out and cleanly fails the call instead of hanging (partial credit toward FEATURE-IDEAS #19) |
| System `CXAction` timeout fires first | `provider:timedOutPerformingAction:` cancels the request and ends the call |

## Implementation checklist

- [ ] `ios/RCTWebRTC/FulfillRequestManager.h/.m` — serial-queue map, `dispatch_after` timeout,
      `createRequestWithTimeout:completion:` / `fulfill:` / `cancel:` / `cancelAll`
- [ ] `ios/RCTWebRTC/CallKitManager.h/.m` — park the action in `performAnswerCallAction:`;
      `onCallAnswered` → `CallKitStringCallback`; `fulfillIncomingCallConnected:` /
      `failIncomingCallConnected:` / `pendingAnswerRequestId`; `reportAnswerFailureForCall:`
      with the `currentCallUUID` guard; `cancelAll` in `cleanup` / `providerDidReset:` /
      `performEndCallAction:`; **new** `provider:timedOutPerformingAction:`
- [ ] `ios/RCTWebRTC/WebRTCModule+CallKit.m` — 3 bridge methods; `answer` event body carries the
      `requestId`
- [ ] Fixed 10-second timeout on iOS and Android
- [ ] `android/.../voip/FulfillRequestManager.kt` — new, ported from theirs, single-call keyed
- [ ] `android/.../voip/CallManager.kt` — `handleAnswered()` creates the request +
      `showConnectingNotification()`; `fulfillAnswered()` does `setActive()` +
      `showOngoingNotification()`; `failAnswered()`; `cancelAll()` in the `finally` block
- [ ] `android/.../voip/CallNotificationManager.kt` — "Connecting…" variant + in-place update to
      the chronometer notification (keeps the FGS start inside its allowed window)
- [ ] `android/.../TelecomController.java` — `onAnswered(String requestId)`; `requestId` in the
      `telecomActionPerformed` body
- [ ] `android/.../WebRTCModule.java` — `fulfillTelecomCallAnswered` / `failTelecomCallAnswered`
      / `getPendingAnswerRequestId`
- [ ] `src/CallKit.ts` — `CallKitAction.answer: string`; 3 new wrappers
- [ ] `src/Telecom.ts` — `TelecomEvent.requestId?: string`; 3 new wrappers
- [ ] `src/VoIP.ts` — cross-platform `fulfillIncomingCallConnected` / `failIncomingCallConnected`
      / `getPendingAnswerRequestId`
- [ ] `src/useVoIPEvents.ts` — `onAnswered: (requestId: string) => void`; both cold-start
      branches use `getPendingAnswerRequestId()` instead of `isCallAnswered()`
- [ ] `src/index.ts` + `packages/mobile-client/src/index.ts` — re-export the new functions
- [ ] `examples/.../app/src/voip/VoipProvider.tsx` — `pendingRequestIdRef`; fulfill in the
      `remotePeers` effect; `failIncomingCallConnected` on the join-failure path; split
      `endCall()` into `resetCallState()` + `endCall()`
- [ ] `examples/mobile-client/voip-call/README.md` §6 — document the handshake, the two
      fulfillers, and the fixed timeout
- [ ] `FEATURE-IDEAS.md` #1 — link here; mark done when it lands

### Verification

- Compile: `JAVA_HOME=~/.sdkman/candidates/java/17.0.18-zulu ./gradlew
  :fishjam-cloud_react-native-webrtc:compileDebugKotlin` (per project memory — the default
  sdkman JDK 26 breaks gradle), and an iOS build of `examples/mobile-client/voip-call/app`.
- Device matrix, both platforms, **warm and cold (killed-app) start** for each:
  1. **Happy path** — answer; confirm the system call timer starts only when the remote peer's
     media arrives, not at answer time. This is the whole point of the change and the one thing
     a unit test cannot show you.
  2. **Join failure** — point `getPeerToken` at a 401; confirm the OS ends the call as *failed*
     (iOS: Recents shows a missed/failed entry, not a 0-second connected call) rather than
     showing a connect-then-drop.
  3. **Timeout** — stub `handleJoinRoom` to never resolve; confirm the call self-terminates
     after ~10 s on both platforms and that a late `fulfillIncomingCallConnected` returns
     `false` instead of resurrecting anything.
  4. **Remote hangup during connect** — hang up from the caller while the callee is joining;
     confirm exactly one `ended` event and no duplicate end report.
  5. **Android FGS** — answer from a killed app with the screen locked; confirm no
     `ForegroundServiceStartNotAllowedException` in logcat (this is what the
     `showConnectingNotification()` split is defending).

## Open questions

- **Does `action.fail()` on a `CXAnswerCallAction` really trigger `CXEndCallAction`?** The
  reference's doc comment says so; Apple's docs don't. The plan ships the defensive
  `reportCallWithUUID:endedAtDate:reason:` either way — but the answer determines whether
  `onCallEnded` fires once or twice, so measure it before wiring JS-side cleanup to `onEnded`.
- **What *is* the system `CXAction` timeout?** Measure with instrumentation in
  `provider:timedOutPerformingAction:` and confirm it does not undercut the fixed 10 s deadline.
- **Should `failIncomingCallConnected` carry a reason?** Item #6 (`CallEndedReason`) would let
  the fail path distinguish `failed` from `remoteEnded`. Not required for #1 — but if #6 lands
  first, thread the reason through instead of hardcoding `CXCallEndedReasonFailed` /
  `DisconnectCause.ERROR`.
- **Should the in-app answer button drive a real `CXAnswerCallAction`?** Today
  `VoipProvider.answerCall()` joins the room without telling CallKit, so an in-app answer never
  creates a fulfill request and the iOS system UI stays out of sync. That is item #16's
  "programmatic answer"; it is the natural next step after this one and would let the
  `requestId` flow through a single path on both platforms.
