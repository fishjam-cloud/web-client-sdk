# Call timeouts — implementation plan

> Implements FEATURE-IDEAS.md item **#3** (incoming / outgoing / fulfill-answer timeouts),
> based on [CALL-TIMEOUTS-RESEARCH.md](./CALL-TIMEOUTS-RESEARCH.md) (verified against
> `~/Desktop/expo-callkit-telecom` source 2026-07-13) and audited against our tree the
> same day. All `file:line` references below were checked against the current code.

## Current state (what exists, what's missing)

| Timeout | iOS | Android |
|---|---|---|
| Fulfill-answer | ✅ hardcoded 10 s — `kFulfillAnswerTimeout`, `CallKitManager.m:8`, used at `:217` | ✅ hardcoded 10 s — `FULFILL_ANSWER_TIMEOUT_MS`, `voip/CallManager.kt:41`, used at `:312` |
| Incoming ring | ❌ rings forever | ❌ rings forever |
| Outgoing dial | ❌ (moot today: `connected` is reported instantly, `CallKitManager.m:80-81`) | ❌ (implementable now: "connected" moment = `setTelecomCallActive()` from JS) |

Everything below keeps the **native-first rule**: ring timers must live in native code
because on both platforms the call can be ringing while no JS exists (iOS PushKit
cold-launch reports the call from `VoipManager.m:79`; Android's
`PushNotificationService.kt:32` reports it from the FCM process before React loads).
A JS `setTimeout` would silently not exist in exactly the scenario the timeout is for.

## Design decisions (with reasoning)

1. **End reason for ring expiry = existing `missed`, no new TS type.**
   Our `missed` already maps to
   [`CXCallEndedReason.unanswered`](https://developer.apple.com/documentation/callkit/cxcallendedreason/unanswered)
   (`CallKitManager.m:123-124`) and
   [`DisconnectCause.MISSED`](https://developer.android.com/reference/android/telecom/DisconnectCause#MISSED)
   (`voip/CallManager.kt:117`) — byte-identical to what expo-callkit-telecom's
   `UNANSWERED` produces natively (their `disconnectCauseFor`, `CallManager.kt:578-582`).
   JS receives `onEnded('missed')` through the existing pipeline
   (`useVoIPEvents.ts:57-60` iOS, `:129-131` Android) with **zero** TS changes.
   Outgoing expiry also uses `missed` (matching their MISSED mapping); if product later
   wants to distinguish, that belongs in FEATURE-IDEAS item #6 (end reasons), not here.

2. **Expiry reuses the normal end-call paths, no bespoke teardown.**
   iOS expiry calls the existing `endCallWithReason:@"missed"` (`CallKitManager.m:135`),
   which already does `reportCallWithUUID:endedAtDate:reason:`, fires `onCallEnded`,
   and runs `cleanup` (cancels fulfill requests, clears the buffered push payload).
   Android expiry calls the existing `endCall(DisconnectCause(MISSED))`
   (`voip/CallManager.kt:108`) → `Disconnect` action → `listener.onEnded("missed")`
   (`:290-292`) → the `finally` block (`:250-267`) which already cancels notifications,
   stops the foreground service, **and broadcasts `ACTION_CALL_ENDED` to dismiss
   `IncomingCallActivity`** — the comment at `:262-263` even anticipates "timeout".
   Nothing new to invent on the teardown side.

3. **Single ring timer, not a per-UUID map.** Both our managers enforce one call at a
   time (`currentCallUUID` + `maximumCallGroups = 1` on iOS `CallKitManager.m:35-36`;
   `if (hasActiveCall) return` on Android `voip/CallManager.kt:177`). Their per-UUID
   `[UUID: Task]` map exists because they support call stores; we'd be adding dead
   generality. One cancellable timer + a call-identity guard at expiry is equivalent
   and simpler. `startRingTimeout` cancels any previous timer first (restart-safe,
   like theirs). Known future upgrade: if multi-call lands
   ([HOLD-MULTICALL-RECENTS-PLAN.md](./HOLD-MULTICALL-RECENTS-PLAN.md) Phase 3), the
   single timer becomes a per-UUID map — that phase owns the migration; don't
   pre-build it here.

4. **One-shot discipline.** The winner between "expire" and "answer/end" must be
   decided once. On iOS everything relevant runs on the main queue (the provider
   delegate uses `queue:nil` → main, `CallKitManager.m:40`; we schedule the expiry
   block on main), so cancel-before-fire is ordered by the queue itself, plus a
   `uuid == currentCallUUID && !isCallAnswered` guard inside the block. On Android the
   answer paths aren't serialized with the timer coroutine, so expiry re-checks the
   `@Volatile` `answered`/`hasActiveCall` flags after `delay()` (same belt-and-braces
   as their `status == CONNECTED` check, `CallManager.kt:173-176`); the residual
   window is closed by the fact that expiry only `trySend`s a `Disconnect` action into
   the same serial `processActions` channel every other transition uses.

5. **Config = build-time metadata, native defaults, exactly like theirs.**
   Info.plist keys on iOS, `<meta-data>` on Android, written by our existing Expo
   config plugin (`packages/mobile-client/plugin`), read once natively with fallbacks
   so bare-RN apps and plugin-less setups keep working. Keys (namespaced to us):
   - `FishjamVoipIncomingCallTimeout` — seconds, default **45**
   - `FishjamVoipOutgoingCallTimeout` — seconds, default **60**
   - `FishjamVoipFulfillAnswerTimeout` — seconds, default **10** (keeps our current
     behavior; theirs defaults to 30 — do *not* silently change an existing deadline)
   Values must be > 0; anything else (missing, 0, negative, non-numeric) falls back to
   the default. No runtime API — matching theirs, and it avoids "timeout changed
   mid-ring" states.

6. **iOS timer primitive: `dispatch_block_t` + `dispatch_after`, wall clock.**
   The ObjC equivalent of their cancellable `Task.sleep`:
   [`dispatch_block_create`](https://developer.apple.com/documentation/dispatch/1431052-dispatch_block_create)
   gives a handle that [`dispatch_block_cancel`](https://developer.apple.com/documentation/dispatch/1431058-dispatch_block_cancel)
   can revoke. Schedule with [`dispatch_walltime`](https://developer.apple.com/documentation/dispatch/1420512-dispatch_walltime)
   rather than `dispatch_time(DISPATCH_TIME_NOW, …)`: the ringing app is typically
   backgrounded (PushKit launch), and the uptime clock stops if the process is
   briefly suspended — wall time fires on schedule or immediately on resume. (The
   existing `FulfillRequestManager.m:36` uses the uptime clock; acceptable there
   because the app is in an active CallKit answer transaction, but don't copy it for
   the ring timer.)

7. **Android timer primitive: a coroutine `Job` with `delay`,** identical to theirs
   and to our existing `FulfillRequestManager.kt` — launched on the existing
   `CallManager.scope` (`Dispatchers.Default`, `voip/CallManager.kt:43`), cancelled via
   [`Job.cancel()`](https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-core/kotlinx.coroutines/-job/cancel.html)
   which aborts the suspended
   [`delay`](https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-core/kotlinx.coroutines/delay.html).

8. **iOS outgoing timeout is gated on OUTGOING-CONNECT-PLAN.md** (FEATURE-IDEAS #2).
   Today `startCallWithDisplayName` reports `connected` in the same completion block
   that would start the timer (`CallKitManager.m:80-81`), so the timer would be
   cancelled microseconds after starting — dead code at best, a live-call killer at
   worst if the cancel is misplaced. Steps 1–5 below are independent of #2; Step 6
   lands with it. **Android outgoing is implementable now** because the "connected"
   moment already exists as a distinct signal (`setTelecomCallActive()` /
   `onSetActive`).

---

## Step 1 — iOS: ring-timer infrastructure + incoming timeout

**File: `packages/react-native-webrtc/ios/RCTWebRTC/CallKitManager.m`**

1a. Replace the single constant at line 8 with three ivars + a read helper (defaults
only in this step; the Info.plist read is Step 3 — keep the diff reviewable):

```objc
static const NSTimeInterval kDefaultIncomingCallTimeout = 45;
static const NSTimeInterval kDefaultOutgoingCallTimeout = 60;
static const NSTimeInterval kDefaultFulfillAnswerTimeout = 10;
```

Add to the class extension (next to `pendingAnswerRequestId`, line 15):

```objc
@property(nonatomic, copy, nullable) dispatch_block_t ringTimeoutBlock;
@property(nonatomic, assign) NSTimeInterval incomingCallTimeout;   // set in init
@property(nonatomic, assign) NSTimeInterval outgoingCallTimeout;
@property(nonatomic, assign) NSTimeInterval fulfillAnswerTimeout;
```

1b. New methods (place next to `cleanup`):

```objc
- (void)startRingTimeoutForCall:(NSUUID *)uuid timeout:(NSTimeInterval)timeout {
    [self cancelRingTimeout];

    __weak typeof(self) weakSelf = self;
    dispatch_block_t block = dispatch_block_create(0, ^{
        typeof(self) strongSelf = weakSelf;
        if (strongSelf == nil) {
            return;
        }
        strongSelf.ringTimeoutBlock = nil;
        // The call this timer was armed for may already be gone or answered.
        if (![uuid isEqual:strongSelf.currentCallUUID] || strongSelf.isCallAnswered) {
            return;
        }
        [strongSelf endCallWithReason:@"missed"];
    });
    self.ringTimeoutBlock = block;
    dispatch_after(dispatch_walltime(NULL, (int64_t)(timeout * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), block);
}

- (void)cancelRingTimeout {
    if (self.ringTimeoutBlock != nil) {
        dispatch_block_cancel(self.ringTimeoutBlock);
        self.ringTimeoutBlock = nil;
    }
}
```

Why this is safe:
- Expiry runs on main; `performAnswerCallAction` / `performEndCallAction` /
  `providerDidReset` also run on main (delegate queue is nil, `CallKitManager.m:40`),
  so a cancel that happens before the block dequeues always wins — no lock needed.
- Expiry → `endCallWithReason:@"missed"` → the reported-reason branch
  (`CallKitManager.m:159-165`): `reportCallWithUUID:endedAtDate:reason:` with
  `CXCallEndedReasonUnanswered` (via `cxEndedReasonForReason`, `:123-124`) — this is
  the documented way to dismiss a ringing CallKit UI for an unanswered call
  ([`reportCall(with:endedAt:reason:)`](https://developer.apple.com/documentation/callkit/cxprovider/reportcall(with:endedat:reason:)))
  — then `onCallEnded(@"missed")` → JS `onEnded('missed')` → the example's
  `endCall('missed')` cleanup, and `cleanup` clears the buffered push payload.
- `endCallWithReason` → `cleanup` → `cancelRingTimeout` calls
  `dispatch_block_cancel` on the *currently executing* block — documented no-op for a
  block that already started; harmless.

1c. Wire the sites:
- **Start**: in `reportIncomingCallWithDisplayName:` (`:103-114`), add a success
  branch to the [`reportNewIncomingCall`](https://developer.apple.com/documentation/callkit/cxprovider/reportnewincomingcall(with:update:completion:))
  completion (it runs on the delegate queue = main):

  ```objc
  completion:^(NSError *_Nullable error) {
      if (error) {
          /* existing failure handling */
          return;
      }
      [weakSelf startRingTimeoutForCall:uuid timeout:weakSelf.incomingCallTimeout];
  }];
  ```

  Only after success, matching theirs — if CallKit refused the call there is nothing
  ringing to time out, and `currentCallUUID` was already reset.
- **Cancel on answer**: first line of `performAnswerCallAction:`
  (`:211`, before `isCallAnswered = YES`): `[self cancelRingTimeout];`.
  This is the *only* answer surface on iOS today — there is no in-app answer bridge
  method (`WebRTCModule+CallKit.m` exports none), the example's `answerCall` is
  triggered *by* this delegate's `onCallAnswered` event. If an in-app answer API is
  ever added (their `answerCall(for:)` via `CXCallController`), it funnels through
  this same delegate anyway, so the cancel site stays correct.
- **Cancel on every teardown**: add `[self cancelRingTimeout];` as the first line of
  `cleanup` (`:185`). That covers `endCallWithReason` (both branches end in cleanup),
  `performEndCallAction` (`:208`), answer-failure teardown
  (`reportAnswerFailureForCall`, `:182`), and `providerDidReset` (`:196`).

**Sanity check (no config yet):** temporarily set the default to ~15 s, ring the
device from the example server, don't answer → CallKit UI dismisses at 15 s, example
shows `lastEndedReason: missed`. Also verify a call answered at ~10 s is *not* ended
at 15 s.

## Step 2 — Android: ring-timer infrastructure + incoming timeout

**File: `packages/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/voip/CallManager.kt`**

2a. Constants and state (next to `FULFILL_ANSWER_TIMEOUT_MS`, line 41):

```kotlin
private const val DEFAULT_INCOMING_CALL_TIMEOUT_MS = 45_000L
private const val DEFAULT_OUTGOING_CALL_TIMEOUT_MS = 60_000L
private const val DEFAULT_FULFILL_ANSWER_TIMEOUT_MS = 10_000L

private var incomingCallTimeoutMs = DEFAULT_INCOMING_CALL_TIMEOUT_MS
private var outgoingCallTimeoutMs = DEFAULT_OUTGOING_CALL_TIMEOUT_MS
private var fulfillAnswerTimeoutMs = DEFAULT_FULFILL_ANSWER_TIMEOUT_MS
private var ringTimeoutJob: Job? = null
```

(Replace the use of `FULFILL_ANSWER_TIMEOUT_MS` at `:312` with
`fulfillAnswerTimeoutMs`; delete the old constant.)

2b. Timer helpers:

```kotlin
private fun startRingTimeout(timeoutMs: Long) {
    cancelRingTimeout()
    ringTimeoutJob = scope.launch {
        delay(timeoutMs)
        // Re-check after waking: the call may have been answered or torn down
        // between the last cancel site and this dispatch.
        if (!hasActiveCall || answered) return@launch
        endCall(DisconnectCause(DisconnectCause.MISSED))
    }
}

private fun cancelRingTimeout() {
    ringTimeoutJob?.cancel()
    ringTimeoutJob = null
}
```

Why this is safe:
- Expiry funnels through the **existing** `endCall` → `CallAction.Disconnect` channel
  (`:108-110`), so it is serialized with every other call transition by
  `processActions` (`:275-294`); the `finally` block then handles notification
  cancel, foreground-service stop, `IncomingCallActivity` dismissal broadcast — all
  already written for exactly this case (`:250-267`).
- `causeToReason(MISSED)` → `"missed"` (`:127`) → `listener.onEnded("missed")` →
  `telecomActionPerformed {event:'ended', reason:'missed'}` (`TelecomController.java:109-114`)
  → JS `onEnded('missed')` (`useVoIPEvents.ts:129-131`). No TS changes.
- The `@Volatile answered` re-check mirrors their `status == CONNECTED` guard; the
  worst-case race (answer lands in the same instant as expiry's `trySend`) resolves
  in the serial action channel, and `handleAnswered`'s cancel (below) shuts the
  window on the common path.
- `scope` is `Dispatchers.Default` — `endCall` only does `actions?.trySend`, which is
  thread-safe ([`Channel.trySend`](https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-core/kotlinx.coroutines.channels/-send-channel/try-send.html)).

2c. Wire the sites:
- **Start (incoming)**: in the `addCall` control-scope body, next to the incoming
  branch (`:222`):

  ```kotlin
  if (isIncoming) {
      callNotificationManager.showIncoming(ctx.applicationContext, displayName, isVideo)
      startRingTimeout(incomingCallTimeoutMs)
  } else {
      showOngoingNotification()
  }
  ```

  Inside the scope body — i.e. only once
  [`CallsManager.addCall`](https://developer.android.com/reference/androidx/core/telecom/CallsManager#addCall(androidx.core.telecom.CallAttributesCompat,kotlin.coroutines.SuspendFunction1,kotlin.coroutines.SuspendFunction1,kotlin.coroutines.SuspendFunction1,kotlin.coroutines.SuspendFunction1))
  has actually registered the call — matching theirs (`CallManager.kt:387-394`), and
  crucially it also runs on the FCM cold-start path since
  `PushNotificationService.kt:32` → `reportIncomingCall` → `register` needs no JS.
- **Cancel on answer**: first line of `handleAnswered()` (`:305`), *before* the
  `pendingAnswerRequestId != null` early-return, so a re-entrant answer can't skip
  the cancel:

  ```kotlin
  private fun handleAnswered() {
      cancelRingTimeout()
      if (pendingAnswerRequestId != null) return
      ...
  ```

  Both answer paths funnel here: external answers via the `onAnswer` lambda (`:209-212`)
  and app-initiated answers via `CallAction.Answer` success (`:286-289`) —
  `IncomingCallActivity`'s swipe/notification answer also goes through
  `CallManager.answer()` (`IncomingCallActivity.kt:103`).
- **Cancel on every teardown**: add `cancelRingTimeout()` to the `finally` block
  (`:250`, alongside `FulfillRequestManager.cancelAll()`). Every end path —
  disconnect action, remote `onDisconnect`, `addCall` failure — flows through
  `finally`, so no timer survives a dead call.

**Sanity check:** same as Step 1, on the emulator, including the killed-app case:
force-stop the app, send the FCM push, don't answer → full-screen incoming UI and
notification disappear at the deadline with no JS ever running.

## Step 3 — native config reads (both platforms, incl. fulfill timeout)

3a. **iOS** — in `CallKitManager.m` `init` (`:29`), after the provider setup:

```objc
static NSTimeInterval timeoutFromInfoPlist(NSString *key, NSTimeInterval fallback) {
    id value = [NSBundle.mainBundle objectForInfoDictionaryKey:key];
    if ([value respondsToSelector:@selector(doubleValue)]) {
        double seconds = [value doubleValue];
        if (seconds > 0) {
            return seconds;
        }
    }
    return fallback;
}
```

```objc
_incomingCallTimeout = timeoutFromInfoPlist(@"FishjamVoipIncomingCallTimeout", kDefaultIncomingCallTimeout);
_outgoingCallTimeout = timeoutFromInfoPlist(@"FishjamVoipOutgoingCallTimeout", kDefaultOutgoingCallTimeout);
_fulfillAnswerTimeout = timeoutFromInfoPlist(@"FishjamVoipFulfillAnswerTimeout", kDefaultFulfillAnswerTimeout);
```

`respondsToSelector:@selector(doubleValue)` accepts both `NSNumber` (plist
`<integer>`) and `NSString` — more forgiving than their `as? Int`, same fallback
semantics ([`object(forInfoDictionaryKey:)`](https://developer.apple.com/documentation/foundation/bundle/1408696-object)).
Then replace `kFulfillAnswerTimeout` at `:217` with `self.fulfillAnswerTimeout`.

3b. **Android** — in `ensureRegistered` (`voip/CallManager.kt:159`), which is the
first point with a `Context` on both the JS and FCM cold-start paths:

```kotlin
private var timeoutsLoaded = false

private fun loadTimeouts(context: Context) {
    if (timeoutsLoaded) return
    timeoutsLoaded = true
    incomingCallTimeoutMs = readTimeoutMs(context, "FishjamVoipIncomingCallTimeout", DEFAULT_INCOMING_CALL_TIMEOUT_MS)
    outgoingCallTimeoutMs = readTimeoutMs(context, "FishjamVoipOutgoingCallTimeout", DEFAULT_OUTGOING_CALL_TIMEOUT_MS)
    fulfillAnswerTimeoutMs = readTimeoutMs(context, "FishjamVoipFulfillAnswerTimeout", DEFAULT_FULFILL_ANSWER_TIMEOUT_MS)
}

/** Reads a manifest meta-data value in seconds; returns milliseconds. */
private fun readTimeoutMs(context: Context, key: String, defaultMs: Long): Long = try {
    val appInfo = context.packageManager.getApplicationInfo(
        context.packageName, PackageManager.GET_META_DATA)
    val seconds = appInfo.metaData?.getInt(key, (defaultMs / 1000).toInt())
        ?: (defaultMs / 1000).toInt()
    if (seconds > 0) seconds * 1000L else defaultMs
} catch (_: Exception) {
    defaultMs
}
```

Call `loadTimeouts(context)` at the top of `ensureRegistered`. Notes:
- [`getApplicationInfo(…, GET_META_DATA)`](https://developer.android.com/reference/android/content/pm/PackageManager#getApplicationInfo(java.lang.String,%20int))
  + [`Bundle.getInt`](https://developer.android.com/reference/android/os/Bundle#getInt(java.lang.String,%20int))
  works because the manifest parser stores a numeric `android:value` as an integer
  [`TypedValue`](https://developer.android.com/guide/topics/manifest/meta-data-element#val)
  — this is exactly the read expo-callkit-telecom does (`CallManager.kt:149-161`),
  so the write format in Step 4 must remain a plain integer string.
- Imports needed: `android.content.pm.PackageManager`.

## Step 4 — config plugin + docs

**Files: `packages/mobile-client/plugin/src/types.ts`, `withFishjamVoip.ts`, new
`withFishjamVoipIos` mod (or extend `withFishjamIos.ts`), and README/docs.**

4a. `types.ts` — one cross-platform knob (the values mean the same thing on both
platforms, so don't split them under `android`/`ios`):

```ts
voip?: {
  /** Seconds an unanswered incoming call rings before auto-ending as `missed`. Default 45. */
  incomingCallTimeout?: number;
  /** Seconds an outgoing call may stay unconnected before auto-ending as `missed`. Default 60. */
  outgoingCallTimeout?: number;
  /** Seconds JS has to fulfill an answered call before it fails. Default 10. */
  fulfillAnswerCallTimeout?: number;
};
```

4b. Android — extend `withFishjamVoipAndroid` (`withFishjamVoip.ts:65`), inside the
existing `enableVoip` gate, next to the `INSTALLATION_ID_META` handling (`:119-126`):
for each provided prop, upsert a meta-data entry
`{ $: { 'android:name': key, 'android:value': String(Math.floor(seconds)) } }` using
the same find-index-or-push pattern. **Write only the props the user set** — omitted
props fall back to native defaults, keeping the manifest clean. Validate
`Number.isFinite(v) && v > 0` and throw a descriptive config error otherwise (fail at
prebuild, not silently at runtime).

4c. iOS — add a small mod using
[`withInfoPlist`](https://docs.expo.dev/config-plugins/plugins-and-mods/#ios-mods):

```ts
config.modResults.FishjamVoipIncomingCallTimeout = Math.floor(props.voip.incomingCallTimeout); // etc.
```

Wire it into the plugin composition in `withFishjam.ts` next to the existing VoIP
mods. Same validation, same only-when-provided rule.

4d. Docs:
- `Telecom.ts:25` — extend the `missed` doc comment: "an incoming call rang and was
  never answered — including the native ring timeout (default 45 s)".
- Example app `README.md` + package docs: document the three plugin props, the native
  defaults, and the bare-RN escape hatch (add the Info.plist keys / manifest
  `<meta-data>` entries by hand).
- Flip FEATURE-IDEAS.md item #3 status when done.

## Step 5 — Android outgoing timeout

Small, isolated, and implementable today because Android already has a real
"connected" signal: the example calls `setTelecomCallActive()` when the first remote
peer joins (`VoipProvider.tsx:254-258`) → `CallAction.Activate`, and external
surfaces (watch/Auto) arrive via the `onSetActive` lambda.

In `voip/CallManager.kt`:
- **Start**: the outgoing branch from Step 2c:

  ```kotlin
  } else {
      showOngoingNotification()
      startRingTimeout(outgoingCallTimeoutMs)
  }
  ```
- **Cancel**: two sites, covering both activation paths:
  - `onSetActive = { answered = true }` (`:218`) → `onSetActive = { answered = true; cancelRingTimeout() }`
  - in `processActions`, on successful `Activate` (`:284-289` area) add an
    `else if (action == CallAction.Activate) { cancelRingTimeout() }` branch —
    [`CallControlScope.setActive()`](https://developer.android.com/reference/androidx/core/telecom/CallControlScope#setActive())
    does **not** invoke the `onSetActive` lambda (that callback is for
    externally-initiated transitions), so both sites are required.
- The Step 2b guard `if (!hasActiveCall || answered)` already protects an active
  outgoing call, because `onSetActive`/successful activate set `answered = true`
  (`:218`, and `fulfillAnswered` → `setCallActive`).
- Hold-plan interplay: [HOLD-MULTICALL-RECENTS-PLAN.md](./HOLD-MULTICALL-RECENTS-PLAN.md)
  Phase 1 reuses `CallAction.Activate` as "un-hold". An un-hold Activate hitting these
  cancel sites is harmless (holding is only possible post-connect, when the ring timer
  is already cancelled), but if Activate is ever split into separate connected/un-hold
  actions, both cancel sites here must move with the *connected* variant.

Semantics note: "connected" for outgoing means *first remote peer joined the room*.
In the example that is precisely when ringing conceptually ends, matching theirs
(`reportOutgoingCallConnected` cancels their timer, `CallManager.kt:437-440`).

## Step 6 — iOS outgoing timeout (⏸ gated on OUTGOING-CONNECT-PLAN.md)

Do **not** implement before FEATURE-IDEAS #2 lands (see decision 8). When it does:
- **Start**: `startRingTimeoutForCall:uuid timeout:self.outgoingCallTimeout` in the
  `requestTransaction` completion of `startCallWithDisplayName:` (`CallKitManager.m:79-85`),
  immediately after `reportOutgoingCallWithUUID:startedConnectingAtDate:` — and the
  instant `connectedAtDate` report at `:81` must already be gone per that plan.
- **Cancel**: in the new `reportOutgoingCallConnected` method that plan introduces
  (mirroring theirs, `CallManager.swift:502-507`), plus the existing `cleanup` site
  from Step 1 already covers all end paths.
- The expiry guard from Step 1 needs one adjustment for outgoing: `isCallAnswered`
  never becomes true for outgoing calls today, so the guard reduces to the UUID check —
  correct, because for outgoing "still ringing" *is* "not torn down and not reported
  connected", and the cancel in `reportOutgoingCallConnected` encodes the latter.
- Add a line to OUTGOING-CONNECT-PLAN.md referencing this step so neither plan ships
  half of the pair (an outgoing timeout with instant-connected reporting can never
  fire *after* the OUTGOING plan if the cancel is wired; an outgoing-connect change
  without the timeout resurrects the "dials forever" gap).

---

## Edge cases audited

| Case | Behavior |
|---|---|
| App suspended mid-ring (iOS) | `dispatch_walltime` fires on schedule or immediately on resume; uptime-clock `dispatch_after` would silently extend the ring (decision 6). |
| Cold start / killed app | Both start sites run without JS (PushKit path `VoipManager.m:79`; FCM path `PushNotificationService.kt:32` — `register` needs no React context). Expiry paths are JS-free too. |
| Metro reload mid-ring | Timers are native singletons; `TelecomController.detach()` only clears the listener, and the iOS manager is a process singleton. The end event after reload reaches JS via the normal re-subscription. |
| Answer at T-0 ms race | iOS: serialized on main queue + UUID/answered guard. Android: `handleAnswered` cancel + post-`delay` volatile re-check + serial action channel (decision 4). |
| Expiry vs. already-ended call | iOS: `endCallWithReason` no-ops on nil `currentCallUUID` (`:136-139`) and the block's UUID guard catches a *new* call reusing the slot. Android: `finally` cancels the timer; the guard re-checks `hasActiveCall`. |
| Second call reusing the timer | `startRingTimeout` cancels any previous timer first (restart-safe, like theirs `CallManager.kt:167`). |
| `IncomingCallActivity` left on screen | Already dismissed by the `ACTION_CALL_ENDED` broadcast in `finally` (`CallManager.kt:262-266`). |
| CallKit's own `timedOutPerformingAction` | Unrelated: it concerns un-fulfilled `CXAction`s post-answer and is already handled (`CallKitManager.m:241-253`); the ring timer only lives pre-answer. |
| Config value invalid | Plugin throws at prebuild; native clamps `<= 0` / non-numeric to defaults (Step 3). |
| Fulfill default change | None — stays 10 s unless configured (decision 5). |

## Verification / QA plan

Configure the example app (`examples/mobile-client/voip-call/app/app.json`) with
short values — `"voip": { "incomingCallTimeout": 15, "outgoingCallTimeout": 20 }` —
prebuild, then run the matrix on both platforms (drive with argent where scripted):

1. **Foreground ring-out**: incoming call, don't answer → auto-end at 15 s, native UI
   gone, example shows `lastEndedReason: missed`, caller side gets the room-leave.
2. **Locked-screen ring-out** (Android full-screen intent, iOS lock-screen CallKit).
3. **Cold-start ring-out**: force-stop the app first; no JS may run before expiry.
4. **Answer at ~10 s** → call connects and is *not* ended at 15 s (ride it past 60 s).
5. **Android outgoing ring-out**: call a room nobody joins → ends at 20 s, `missed`.
6. **Android outgoing answered**: callee joins at ~10 s → no end at 20 s.
7. **Fulfill timeout regression**: answer while Metro is stopped (JS can't fulfill) →
   call fails at 10 s exactly as today.
8. **Defaults path**: remove the `voip` config, prebuild → behavior unchanged except
   45/60 s auto-end.

## Files touched (summary)

| File | Change |
|---|---|
| `packages/react-native-webrtc/ios/RCTWebRTC/CallKitManager.m` | ring timer, start/cancel sites, Info.plist reads, fulfill timeout ivar |
| `packages/react-native-webrtc/android/.../voip/CallManager.kt` | ring timer, start/cancel sites, meta-data reads, fulfill timeout var |
| `packages/mobile-client/plugin/src/types.ts` | `voip` timeout props |
| `packages/mobile-client/plugin/src/withFishjamVoip.ts` | Android meta-data entries |
| `packages/mobile-client/plugin/src/withFishjamIos.ts` (or new mod) | Info.plist keys |
| `packages/react-native-webrtc/src/Telecom.ts` | `missed` doc comment only |
| READMEs / FEATURE-IDEAS.md | config docs, status flip |

No changes to: `FulfillRequestManager` (either platform), `useVoIPEvents.ts`,
`CallKit.ts` API surface, `TelecomController.java`, the example's `VoipProvider.tsx`
(it already handles `onEnded('missed')`).
