# Call timeouts — how expo-callkit-telecom does it

> Deep-dive into how `~/Desktop/expo-callkit-telecom` implements the three call timeouts
> (incoming / outgoing / fulfill-answer), verified against their source on 2026-07-13.
> Companion to [FEATURE-IDEAS.md](./FEATURE-IDEAS.md) item **#3** and
> [ANSWER-HANDSHAKE-PLAN.md](./ANSWER-HANDSHAKE-PLAN.md) (their fulfill-answer timeout is
> the timeout leg of the handshake we already ported with a hardcoded 10 s deadline).

## The three timeouts at a glance

| Timeout | Default | Starts when… | Cancelled when… | On expiry |
|---|---|---|---|---|
| **Incoming** | 45 s | the incoming call is reported to CallKit / Core-Telecom | user answers, call ends, provider resets | end call, reason `unanswered` |
| **Outgoing** | 60 s | the outgoing call starts connecting (`CXStartCallAction` / Telecom scope up) | app calls `reportOutgoingCallConnected`, call ends, provider resets | stop dialtone, end call, reason `unanswered` |
| **Fulfill-answer** | 30 s | the answer event (with `requestId`) is emitted to JS | JS fulfills or fails the request, call ends | iOS: `CXAnswerCallAction.fail()` → CallKit tears the call down; Android: end call, reason `failed` |

Key structural point: the incoming/outgoing **ring timeouts** and the **fulfill-answer
timeout** are two separate mechanisms. Ring timeouts live in `CallManager` as per-call
cancellable timers keyed by call UUID. The fulfill timeout lives inside
`FulfillRequestManager` and is the third resolution path of a pending answer request
(fulfilled / cancelled / timed out) — it is never tracked in the ring-timeout map.

---

## Configuration pipeline (config plugin → build metadata → native)

Values are **build-time config, not runtime API**. The Expo
[config plugin](https://docs.expo.dev/config-plugins/introduction/) accepts three props
and bakes them into platform metadata; the native side reads them once at startup.

1. **Props + defaults** — `plugin/src/withExpoCallKitTelecom.ts:19-38` declares
   `incomingCallTimeout`, `outgoingCallTimeout`, `fulfillAnswerCallTimeout` (seconds).
   Defaults in `plugin/src/constants.ts:2-4`: **45 / 60 / 30**.

2. **iOS** — `withTimeouts` (`plugin/src/withExpoCallKitTelecomIos.ts:106-121`) writes
   three Info.plist keys via [`withInfoPlist`](https://docs.expo.dev/config-plugins/plugins-and-mods/#ios-mods):
   - `ExpoCallKitTelecomIncomingCallTimeout`
   - `ExpoCallKitTelecomOutgoingCallTimeout`
   - `ExpoCallKitTelecomFulfillAnswerCallTimeout`

3. **Android** — `withTimeouts` (`plugin/src/withExpoCallKitTelecomAndroid.ts:57-87`)
   writes the same three keys as `<meta-data>` entries in `AndroidManifest.xml` via
   [`AndroidConfig.Manifest.addMetaDataItemToMainApplication`](https://docs.expo.dev/config-plugins/plugins-and-mods/#android-mods)
   (values stringified seconds).

4. **Native read**:
   - iOS reads lazily via [`Bundle.main.object(forInfoDictionaryKey:)`](https://developer.apple.com/documentation/foundation/bundle/1408696-object)
     into `static let` [`Duration`](https://developer.apple.com/documentation/swift/duration)s
     with the same hardcoded fallbacks (`ios/Managers/CallManager.swift:32-48` for
     incoming/outgoing, `ios/Managers/CallManager+CXProviderDelegate.swift:7-14` for
     fulfill-answer).
   - Android reads in `CallManager.initialize()` via
     [`PackageManager.getApplicationInfo(…, GET_META_DATA)`](https://developer.android.com/reference/android/content/pm/PackageManager#getApplicationInfo(java.lang.String,%20int))
     → `readTimeoutMs()` seconds→ms conversion, `try/catch` falling back to defaults
     (`android/.../managers/CallManager.kt:126-131, 148-161`).

Because both platforms fall back to the same defaults when the key is missing, the
feature works even without the config plugin step.

---

## iOS implementation

### Ring timeouts (incoming + outgoing) — `CallManager`

State: `callTimeoutTasks: [UUID: Task<Void, Never>]` guarded by an `NSLock`
(`CallManager.swift:50-54`). One structured-concurrency
[`Task`](https://developer.apple.com/documentation/swift/task) per call — no `Timer`,
no `DispatchQueue.asyncAfter`.

`startCallTimeout(for:timeout:)` (`CallManager.swift:91-116`):

```swift
let task = Task {
  try? await Task.sleep(for: timeout)
  guard !Task.isCancelled else { return }
  self.removeTimeoutTask(for: id)      // claim ownership of expiry
  DialtonePlayer.shared.stop()          // outgoing dialtone, no-op otherwise
  await reportCallEnded(for: id, reason: .unanswered)
}
callTimeoutTasks[id] = task             // under lock
```

- Cancellation is cooperative: `cancelCallTimeout` removes the task under the lock and
  calls [`Task.cancel()`](https://developer.apple.com/documentation/swift/task/cancel()),
  which makes the in-flight [`Task.sleep`](https://developer.apple.com/documentation/swift/task/sleep(for:tolerance:clock:))
  throw; the `guard !Task.isCancelled` then bails (`CallManager.swift:97, 129-137`).
- Expiry funnels into the same `reportCallEnded(for:reason:)` used for remote hangups
  (`CallManager.swift:560-579`): stops dialtone, cancels any timeout (idempotent),
  reports to CallKit via [`CXProvider.reportCall(with:endedAt:reason:)`](https://developer.apple.com/documentation/callkit/cxprovider/reportcall(with:endedat:reason:))
  with [`CXCallEndedReason`](https://developer.apple.com/documentation/callkit/cxcallendedreason)`.unanswered`,
  emits `CallReportedEnded` to JS with the ended session snapshot, and removes the session.

**Start sites:**
- Incoming: after [`reportNewIncomingCall`](https://developer.apple.com/documentation/callkit/cxprovider/reportnewincomingcall(with:update:completion:))
  succeeds — both the async path (`CallManager.swift:340`) and the callback path used for
  VoIP pushes from a terminated state (`CallManager.swift:417`, inside the completion,
  in a detached `Task` after the session is stored).
- Outgoing: in the [`CXStartCallAction`](https://developer.apple.com/documentation/callkit/cxstartcallaction)
  delegate, right after [`reportOutgoingCall(with:startedConnectingAt:)`](https://developer.apple.com/documentation/callkit/cxprovider/reportoutgoingcall(with:startedconnectingat:))
  (`CallManager+CXProviderDelegate.swift:30-35`).

**Cancel sites:**
- [`CXAnswerCallAction`](https://developer.apple.com/documentation/callkit/cxanswercallaction)
  delegate — first line, before the fulfill handshake starts
  (`CallManager+CXProviderDelegate.swift:58-62`). The incoming ring timeout is *replaced*
  by the fulfill-answer timeout at this moment.
- `reportOutgoingCallConnected` — stops dialtone + cancels (`CallManager.swift:502-507`).
- [`CXEndCallAction`](https://developer.apple.com/documentation/callkit/cxendcallaction)
  delegate — user/system hangup (`CallManager+CXProviderDelegate.swift:99-104`).
- `reportCallEnded` — any external end (`CallManager.swift:563-565`).
- [`providerDidReset`](https://developer.apple.com/documentation/callkit/cxproviderdelegate/providerdidreset(_:))
  — `cancelAllCallTimeouts()` drains the whole map atomically, plus
  `FulfillRequestManager.cancelAll()` (`CallManager+CXProviderDelegate.swift:18-26`,
  `CallManager.swift:139-161`).

### Fulfill-answer timeout — `FulfillRequestManager` (actor)

`ios/Managers/FulfillRequestManager.swift` is an [`actor`](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/#Actors)
holding `pendingRequests: [UUID: PendingRequest]`, where each request bundles the call
ID, a [`CheckedContinuation`](https://developer.apple.com/documentation/swift/checkedcontinuation)
and its own timeout `Task` (`FulfillRequestManager.swift:30-36`).

The delegate literally **suspends the `CXAnswerCallAction` on the request's outcome**
(`CallManager+CXProviderDelegate.swift:64-94`):

```swift
let (requestId, resultTask) = await FulfillRequestManager.shared.createRequest(
  callId: action.callUUID, timeout: Self.answerCallTimeout)
CallEventEmitter.shared.send(CallAnsweredEvent(id: action.callUUID, requestId: requestId))
switch await resultTask.value {
case .fulfilled: action.fulfill()
case .cancelled: action.fail()     // JS called failIncomingCallConnected
case .timedOut:  action.fail()     // 30 s elapsed with no JS response
}
```

- `createRequest` (`FulfillRequestManager.swift:50-93`) wraps a
  [`withCheckedContinuation`](https://developer.apple.com/documentation/swift/withcheckedcontinuation(isolation:function:_:))
  in a `Task<Result, Never>` and spawns a sibling timeout task
  (`Task.sleep(for: timeout)`); whichever side wins **removes the request from the map
  first**, so the continuation is resumed exactly once — the loser finds the map empty
  and no-ops.
- `fulfill(requestId:)` (`:102-114`) — removes the entry, cancels the timeout task,
  resumes `.fulfilled(callId:)`. Returns `nil` if the request already timed out; the JS
  API surfaces that as `fulfillIncomingCallAnswered` resolving `false`
  (`ExpoCallKitTelecomModule.swift:365-373`).
- `cancel(requestId:)` (`:121-129`) — same, resumes `.cancelled`. This is
  `failIncomingCallConnected` from JS.
- On timeout/cancel the delegate calls [`action.fail()`](https://developer.apple.com/documentation/callkit/cxaction/fail());
  per their docs (`CallManager.swift:481-487`) CallKit then ends the call via
  `CXEndCallAction`, which runs the normal cleanup path — so a fulfill timeout does
  **not** emit `unanswered`; it surfaces as a failed answer → ended call.

There is deliberately **no ring timeout restart** after answering: once answered, the
call is either connected (JS fulfilled) or dead (fail/timeout) — never back to ringing.

---

## Android implementation

### Ring timeouts — `CallManager` coroutines

State: each call's `CallController` carries a `timeoutJob: Job?`
(`android/.../managers/CallManager.kt:84-90`), launched on a
`CoroutineScope(Dispatchers.Main + SupervisorJob())`.

`startCallTimeout(id, timeoutMs)` (`CallManager.kt:166-183`):

```kotlin
cancelCallTimeout(id)                       // restart-safe
val job = scope.launch {
    delay(timeoutMs)                        // cancellable suspend
    val session = CallStore.session(id) ?: return@launch
    if (session.status == CallSessionStatus.CONNECTED) return@launch  // race guard
    DialtonePlayer.stop()
    reportCallEnded(id, CallEndedReason.UNANSWERED)
}
activeCalls[id]?.timeoutJob = job
```

Two guards the iOS side doesn't need: the session-existence check and the
`status == CONNECTED` check after [`delay`](https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-core/kotlinx.coroutines/delay.html)
resumes — belt-and-braces against a connect racing the expiry on the main dispatcher.
Cancellation is [`Job.cancel()`](https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-core/kotlinx.coroutines/-job/cancel.html)
(`CallManager.kt:186-191`), which aborts the suspended `delay`.

**Start sites:**
- Outgoing: last step of the Core-Telecom call scope body, after
  [`CallsManager.addCall`](https://developer.android.com/reference/androidx/core/telecom/CallsManager#addCall(androidx.core.telecom.CallAttributesCompat,kotlin.coroutines.SuspendFunction1,kotlin.coroutines.SuspendFunction1,kotlin.coroutines.SuspendFunction1,kotlin.coroutines.SuspendFunction1,kotlin.coroutines.SuspendFunction2))
    is up, dialing notification shown, dialtone playing (`CallManager.kt:296`).
- Incoming: inside the incoming call scope, right after `INCOMING_CALL_REPORTED` is
  emitted (`CallManager.kt:387-394`).

**Cancel sites:**
- `onCallAnswered` — shared answer entrypoint for both the system Telecom `onAnswer`
  lambda and the in-app `answerCall()` (`CallManager.kt:825`); like iOS, the ring timeout
  is replaced by the fulfill request.
- `reportOutgoingCallConnected` — with `DialtonePlayer.stop()` (`CallManager.kt:437-440`).
- `finishCall` — the shared finalizer behind both `endCall` and `reportCallEnded`, which
  also runs `FulfillRequestManager.cancelForCall(id)` so **every** end path clears both
  mechanisms at once (`CallManager.kt:483-486`).

Expiry funnels into `reportCallEnded(id, UNANSWERED)` → `finishCall` → Telecom
disconnect via the action channel with a mapped
[`DisconnectCause`](https://developer.android.com/reference/android/telecom/DisconnectCause),
`CALL_REPORTED_ENDED` event to JS with `reason: "unanswered"`, session removal
(`CallManager.kt:464-518`).

### Fulfill-answer timeout — `FulfillRequestManager` (object)

`android/.../managers/FulfillRequestManager.kt` is a singleton with two maps
(`requests: requestId→callId`, `timeoutJobs: requestId→Job`) guarded by
`synchronized(lock)` (`:38-44`). Unlike iOS there is no parked action to resume
(Core-Telecom answers via a suspend lambda, not a CXAction), so the request resolves
through an **`onTimeout` callback** instead of a continuation:

- `onCallAnswered` creates the request and wires expiry straight to
  `reportCallEnded(callId, CallEndedReason.FAILED)` (`CallManager.kt:838-841`) — note:
  **`failed`, not `unanswered`**, mirroring iOS where a fulfill timeout fails the answer
  action rather than reporting an unanswered ring.
- `createRequest` (`FulfillRequestManager.kt:53-81`): launch `delay(timeoutMs)`; on wake,
  atomically remove both map entries and only invoke `onTimeout` if the request was still
  present — same "remove-first wins" one-shot discipline as the iOS actor.
- `fulfill(requestId)` (`:88-107`): atomically remove + cancel the timeout job; returns
  the `callId` or `null` if already timed out (JS `fulfillIncomingCallConnected` then
  returns `false`, `CallManager.kt:417-434`).
- `cancel(requestId)` (`:114-124`) and `cancelForCall(callId)` (`:132-149`) cover the
  JS-fail path and the call-ended path respectively.

---

## Design details worth copying

1. **Two mechanisms, not one.** Ring timeouts are per-call cancellable timers owned by
   the call manager; the fulfill timeout is a resolution path of the pending answer
   request. Keeping them separate keeps every cancel site trivial.
2. **One-shot by construction.** Both platforms make "expire" and "resolve" race safely
   by *removing the map entry first* under a lock/actor; whoever removes it owns the
   outcome, the other side no-ops. This is exactly the double-settlement problem our
   `pendingAnswerRequestIdRef` clear-before-await in `VoipProvider.tsx` solves at the JS
   layer — they solve it natively.
3. **Expiry reuses the normal end-call path** (`reportCallEnded`) instead of a bespoke
   teardown, so notifications, audio, JS events, and store cleanup can't drift.
4. **Every end path cancels both mechanisms** (Android `finishCall` cancels the ring
   timer *and* `cancelForCall`; iOS `providerDidReset` drains both). No leaked timers
   after hangup.
5. **Reason semantics:** ring expiry → `unanswered`; fulfill expiry → failed answer
   (`CXAnswerCallAction.fail()` on iOS, `CallEndedReason.FAILED` on Android). Callers can
   distinguish "nobody picked up" from "picked up but media never connected".
6. **Restart-safe start:** Android's `startCallTimeout` cancels any existing timer for
   the id before launching a new one.
7. **Build-time config with native defaults**, so the module behaves sanely even when
   the plugin props are omitted.

## Porting notes for our `packages/react-native-webrtc`

- We already have the fulfill-answer timeout from the handshake port
  (ANSWER-HANDSHAKE-PLAN.md), but hardcoded at 10 s. Making it configurable means:
  an Info.plist key read in `ios/RCTWebRTC` (CallKit/Voip managers) and a manifest
  `<meta-data>` read in `android/.../voip/` — we don't have an Expo config plugin, so
  the app sets these directly (or via `expo.android.manifest`-style config if the
  example app adopts one).
- The missing pieces are the **incoming** and **outgoing** ring timeouts:
  - iOS: a `[UUID: Task]` map in `CallKitManager.m`'s Swift-adjacent layer is awkward
    from ObjC — `NSMapTable` of `dispatch_block_t` created with
    [`dispatch_block_create`](https://developer.apple.com/documentation/dispatch/1431052-dispatch_block_create)
    + [`dispatch_after`](https://developer.apple.com/documentation/dispatch/1452876-dispatch_after)
    and cancelled with [`dispatch_block_cancel`](https://developer.apple.com/documentation/dispatch/1431058-dispatch_block_cancel)
    is the ObjC-native equivalent of their cancellable `Task.sleep`.
  - Android: our `voip/` controllers already use coroutines around Core-Telecom, so the
    `timeoutJob`-per-call pattern maps over almost verbatim.
  - Expiry should call our existing native end-call/report-ended path with the
    `unanswered` reason we added in the endCall-reasons work, so JS receives it through
    the same `onEnded` event `VoipProvider.tsx` already handles.
- Watch the interaction with OUTGOING-CONNECT-PLAN.md: an outgoing ring timeout is only
  correct once we stop reporting `connected` immediately (their timeout works *because*
  connect reporting is deferred until real media connect — otherwise every outgoing call
  would be "connected" instantly and the timeout would never matter, or worse, fire on
  a live call if the connected-status guard is missing).
