# Hold, multiple calls, Recents & Siri — research + implementation plan

> Covers four related asks: (1) on-hold support, (2) multiple simultaneous incoming
> calls with the ability to dismiss one of them, (3) calls appearing in iOS Recents,
> (4) an assessment of expo-callkit-telecom's Siri integration. Verified against
> `~/Desktop/expo-callkit-telecom` source and our tree on 2026-07-13. Companion to
> [CALL-TIMEOUTS-RESEARCH.md](./CALL-TIMEOUTS-RESEARCH.md) /
> [CALL-TIMEOUTS-PLAN.md](./CALL-TIMEOUTS-PLAN.md) — Phase 3 below supersedes part of
> that plan's timer design (called out explicitly where it does).

## TL;DR verdicts

| Ask | Verdict |
|---|---|
| Hold | Do it — and it's not just a feature: **without it, media keeps flowing while the OS holds our call for a cellular interruption** (real bug on both platforms today). Phase 1, moderate effort. |
| Multiple incoming calls | Possible, but it is **not** `supportsGrouping`/`supportsUngrouping` — those gate conference-merge UI and must stay off. The real enablers are `maximumCallGroups=2` + hold + per-call identity through the whole stack. Phase 3, large, breaking API change. |
| Recents | `includesCallsInRecents = YES` is one line; making the Recents entry *tappable-to-call-back* requires the call-intent plumbing. Phase 2, small-to-moderate. |
| Siri | **Free byproduct of Phase 2, don't invest beyond that.** Their entire "Siri integration" is the same `INStartCallIntent` handler Recents uses + 3 Info.plist entries. Real Siri usefulness needs phone/email handles we don't have (FEATURE-IDEAS #4 dependency). |

---

# Part I — Research

## How expo-callkit-telecom does hold

**iOS.** Their JS `setHeld(id, onHold)` (`ExpoCallKitTelecomModule.swift:463-471`) requests a
[`CXSetHeldCallAction`](https://developer.apple.com/documentation/callkit/cxsetheldcallaction)
transaction through `CXCallController` (`CallManager.swift:661-681`). The provider
delegate (`CallManager+CXProviderDelegate.swift:141-154`) then updates the session
store and emits `SetHeldActionEvent` to JS, and JS is responsible for actually pausing
media. Note their config sets `supportsHolding = false` (`CallManager.swift:27`) — a
deliberate choice: app-driven hold works via transactions regardless, but the *system*
never holds their call (an incoming cellular call offers only "End & Accept", never
"Hold & Accept").

**Android.** `setHeld(id, onHold)` (`CallManager.kt:631-645`) sends `setInactive`/
`setActive` into the per-call action channel →
[`CallControlScope.setInactive()`](https://developer.android.com/reference/androidx/core/telecom/CallControlScope#setInactive()) /
`setActive()` (`:741, :738-740`), updates the store, and emits `SET_HELD_ACTION`.
Crucially, they also wire the **externally-initiated** direction: the `addCall`
lambdas `onSetActive = { setHeld(id, false) }` and `onSetInactive = { setHeld(id, true) }`
(`:699-700`) — this is what fires when *Telecom itself* holds the call because another
app's call went active. All their calls declare
[`CallAttributesCompat.SUPPORTS_SET_INACTIVE`](https://developer.android.com/reference/androidx/core/telecom/CallAttributesCompat#SUPPORTS_SET_INACTIVE)
(`:265, :374`).

**Multiple calls: they don't.** Hard single-session guards on both platforms
(`CallManager.swift:216-220`, `CallManager.kt:318-325`), `maximumCallGroups = 1`
(`CallManager.swift:59-60`). So Phase 3 below goes beyond their library — but their
per-call plumbing (`activeCalls[UUID]` map, `launchCallScope`, `CallManager.kt:676-748`)
is the exact shape a multi-call refactor needs, which is presumably why it's built
that way.

## How they do Recents + Siri (one mechanism, not two)

1. **Recents entries**: `includesCallsInRecents = true`
   ([`CXProviderConfiguration.includesCallsInRecents`](https://developer.apple.com/documentation/callkit/cxproviderconfiguration/includescallsinrecents),
   `CallManager.swift:62`) plus *meaningful handles*: `makeHandle` prefers
   `phoneNumber` → `email` → generic participant id (`CallManager.swift:166-174`).
   Their TS docs are explicit that a phone-number handle is what "enables Recents and
   Siri" (`Calls.types.ts:95`).
2. **Recents tap / Siri "call Jane using <app>"**: both arrive as an
   [`INStartCallIntent`](https://developer.apple.com/documentation/sirikit/instartcallintent)
   inside `application(_:continue:restorationHandler:)`. Their
   `AppDelegateSubscriber.swift:31-92` unwraps `userActivity.interaction?.intent`,
   accepts `INStartCallIntent` plus the deprecated-but-still-delivered
   `INStartAudioCallIntent`/`INStartVideoCallIntent`, extracts the first
   [`INPerson`](https://developer.apple.com/documentation/sirikit/inperson)'s
   `personHandle`, and emits `CallIntentReceivedEvent { handle, handleType, hasVideo }`
   to JS (queue-buffered for cold start, `AppDelegateSubscriber.swift:20`). JS then
   starts the outgoing call itself — sessions started this way get origin
   `outgoingSystem` (`Calls.types.ts:76`, `CallManager.swift:208`).
3. **The config plugin part**: adds the three intent class names to
   [`NSUserActivityTypes`](https://developer.apple.com/documentation/bundleresources/information-property-list/nsuseractivitytypes)
   in Info.plist (`withExpoCallKitTelecomIos.ts:29-97`). That's the entire "Siri
   integration" — no Intents app extension, no shortcut donations, no custom
   vocabulary. CallKit auto-donates the `INInteraction`s for calls it reports, which
   is what populates both Recents and Siri suggestions.

**Siri assessment for us:** with our current generic handles (`CXHandleTypeGeneric`
carrying `displayName`, `CallKitManager.m:59, :94`), Siri's contact resolution has
nothing to match against — "Hey Siri, call Paweł using <app>" works unreliably at
best. The plumbing is still worth having because Recents needs the identical code
path; the *quality* upgrade for both comes automatically if FEATURE-IDEAS **#4**
(richer push payload with `phoneNumber`/`email` in a caller object) ever lands.
Recommendation: implement Phase 2, mark Siri "works where handles allow", spend
nothing more.

## `supportsGrouping` / `supportsUngrouping` — what they actually gate

You asked to investigate these for multi-call. Result: **they are the wrong knob, and
should stay off.**

- [`supportsGrouping`](https://developer.apple.com/documentation/callkit/cxcallupdate/supportsgrouping)
  advertises that this call can be *merged* with another into one call group — it
  makes the system UI show a "merge" affordance, which arrives as
  [`CXSetGroupCallAction`](https://developer.apple.com/documentation/callkit/cxsetgroupcallaction).
  That is conference calling (N parties, one mixed audio session).
- [`supportsUngrouping`](https://developer.apple.com/documentation/callkit/cxcallupdate/supportsungrouping)
  advertises the reverse: splitting a call out of a group.
- What "two independent calls, switch between them, dismiss one" — i.e. call waiting —
  actually needs is:
  - [`maximumCallGroups`](https://developer.apple.com/documentation/callkit/cxproviderconfiguration/maximumcallgroups)
    `= 2` (each independent call is its own group of 1; we have `1` today,
    `CallKitManager.m:36`),
  - `maximumCallsPerCallGroup = 1` (unchanged — forbids merging),
  - `supportsHolding = true` on the calls — without it the second-call sheet offers
    only **End & Accept / Decline**; with it you also get **Hold & Accept**,
  - per-UUID bookkeeping, because "dismiss one of several" is just a
    [`CXEndCallAction`](https://developer.apple.com/documentation/callkit/cxendcallaction)
    targeted at that call's UUID.
- Both libraries already `fail` the group action (`CallKitManager.m:269-271`) —
  keep that, keep both flags `NO`.

Android equivalent: [`CallsManager`](https://developer.android.com/reference/androidx/core/telecom/CallsManager)
happily hosts multiple concurrent `addCall` scopes; the platform coordinates "only
one active at a time" through `onSetInactive` — the same hook hold uses. There is no
grouping flag to worry about; the work is entirely in our singleton-shaped manager.

One more Android fact worth stating so nobody looks for parity: **self-managed calls
(`MANAGE_OWN_CALLS` / Core-Telecom) never appear in the system call log** — "Recents"
is an iOS-only concept here; Android apps keep in-app call history.

## Current state of our code (audited)

| Piece | iOS | Android |
|---|---|---|
| Hold action from system | `performSetHeldCallAction` exists and emits `held` (`CallKitManager.m:255-260`, `WebRTCModule+CallKit.m:38-40`) — but effectively **dead code**: `supportsHolding = NO` (`:97`) means the system never sends it | `onSetInactive = { }` — **silently swallowed** (`voip/CallManager.kt:219`). If a cellular call is answered, Telecom holds us and we keep streaming media. Latent bug. |
| Hold action from app | No bridge method | `CallAction.Hold → setInactive()` exists in the action loop (`:279`) but **nothing ever sends it** — no bridge method |
| Un-hold | — | `CallAction.Activate → setActive()` exists and is reachable (it's the "connected" signal) |
| Hold in TS types | `CallKitAction.held?: boolean` exists (`CallKit.ts:18`), `useCallKitEvent('held', …)` works | `TelecomEventType` has no hold member; `CallEventsListener` has no hold callback |
| Multi-call | Hard single call: `currentCallUUID`, `maximumCallGroups=1` | Hard single call: `hasActiveCall` guard (`:177`), all state is singleton fields |
| Recents | `includesCallsInRecents = NO` (`:37`) | n/a (no system call log for self-managed) |
| Call intents | Nothing handles `continueUserActivity` | n/a |
| `SUPPORTS_SET_INACTIVE` | n/a | already declared (`:196`) ✓ |

So hold is *half-wired on both platforms in opposite halves*: iOS has the
system→JS event but no way to trigger or receive holds; Android has the app→Telecom
action but no trigger, no events, and drops external holds.

---

# Part II — Implementation plan

Phases are independently shippable and ordered by value/effort. 1 and 2 are additive;
3 is breaking.

## Phase 1 — Hold (single call, both platforms)

### 1a. iOS: enable holding + app-side API

**`packages/react-native-webrtc/ios/RCTWebRTC/CallKitManager.m`**

1. Flip the incoming-call update: `update.supportsHolding = YES` (`:97`).
2. Outgoing calls get no `CXCallUpdate` today, so their hold capability rides on
   CallKit defaults. Make it explicit: in the `startCallWithDisplayName:` transaction
   completion (`:79-85`), report an update —

   ```objc
   CXCallUpdate *update = [[CXCallUpdate alloc] init];
   update.supportsHolding = YES;
   update.supportsGrouping = NO;
   update.supportsUngrouping = NO;
   update.supportsDTMF = NO;
   [weakSelf.provider reportCallWithUUID:uuid updated:update];
   ```

   (Verify against the `CXCallUpdate.h` header during implementation: the
   capability properties default to YES, which is exactly why every serious
   integration sets all of them explicitly — silent defaults are how the grouping
   button appears by accident.)
3. Track state + expose an app API:

   ```objc
   @property(nonatomic, assign) BOOL isCallOnHold;   // class extension

   - (void)setCallHeld:(BOOL)onHold {
       if (self.currentCallUUID == nil) {
           return;
       }
       CXSetHeldCallAction *action =
           [[CXSetHeldCallAction alloc] initWithCallUUID:self.currentCallUUID onHold:onHold];
       CXTransaction *transaction = [[CXTransaction alloc] initWithAction:action];
       [self.callController requestTransaction:transaction completion:^(NSError *error) {
           if (error) {
               NSLog(@"[CallKitManager] Failed to set held: %@", error.localizedDescription);
           }
           // performSetHeldCallAction fires on success and emits the event —
           // do not emit here or JS sees the change twice.
       }];
   }
   ```
4. In `performSetHeldCallAction:` (`:255-260`) set `self.isCallOnHold = action.isOnHold`
   before the existing `onCallHeld` emit. Reset `isCallOnHold` in `cleanup`.
5. Guard interplay: an on-hold call must not be killed by the answer path or timers —
   ring timers (CALL-TIMEOUTS-PLAN) only run pre-answer, no interaction. But
   `endCallWithReason:` works held ✓ (End button while held is legitimate).

**`WebRTCModule+CallKit.m`** — export `setCallKitCallHeld:(BOOL)onHold` (promise), plus
`RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(isCallKitCallHeld)` for state rehydration.

Audio note (why there is no native audio work): when CallKit holds the only call it
deactivates the AVAudioSession, and our delegate already forwards
`didActivate`/`didDeactivate` to `RTCAudioSession` (`CallKitManager.m:273-279`), so
the WebRTC audio unit stops/starts correctly. What native code *cannot* do is stop
the outbound video track or tell the remote party — that's JS (below).

### 1b. Android: expose the action, emit the events, fix the swallow

**`voip/CallManager.kt`**

1. Add the missing listener member and an un-hold-capable API:

   ```kotlin
   interface CallEventsListener {
       // ... existing ...
       fun onHoldChanged(onHold: Boolean)
   }

   fun setCallHeld(onHold: Boolean) {
       actions?.trySend(if (onHold) CallAction.Hold else CallAction.Activate)
   }
   ```
2. Wire the **external** transitions (the bug fix) in `register`'s `addCall` lambdas
   (`:213-219`):

   ```kotlin
   onSetActive = { answered = true; listener?.onHoldChanged(false) },
   onSetInactive = { listener?.onHoldChanged(true) },
   ```
3. Wire the **app-initiated** transitions in `processActions` (`:284-293`) — the
   lambdas above do *not* fire for `scope.setInactive()`/`setActive()` calls we make
   ourselves (same asymmetry as the answer path, `:286-289`):

   ```kotlin
   } else if (action == CallAction.Hold) {
       listener?.onHoldChanged(true)
   } else if (action == CallAction.Activate) {
       // Activate doubles as "outgoing connected" and "un-hold"; both mean not-held.
       listener?.onHoldChanged(false)
   }
   ```
4. Track `@Volatile var onHold = false` next to `answered` for the sync getter, reset
   in the `finally` block.

Caveat to encode in a comment: `CallAction.Activate` is also the outgoing-connected
signal (`setTelecomCallActive()` from JS), so JS will see a spurious
`holdChanged(false)` when an outgoing call connects. That is harmless (it's already
not held) but must not be "fixed" by splitting the action without also updating the
CALL-TIMEOUTS-PLAN Step 5 cancel site.

**`TelecomController.java`** — implement `onHoldChanged` → emit
`telecomActionPerformed { event: 'holdChanged', held }`; add `setCallHeld`/`isOnHold`
pass-throughs. **`WebRTCModule.java`** — export `setTelecomCallHeld(boolean)` and
sync `isTelecomCallHeld()` next to the existing Telecom methods (`:1707-1747`).

### 1c. TS + example

- `Telecom.ts`: add `'holdChanged'` to `TelecomEventType`, `held?: boolean` to
  `TelecomEvent`; export `setTelecomCallHeld(onHold)` / `isTelecomCallHeld()`.
- `CallKit.ts`: export `setCallKitCallHeld(onHold)` / `isCallKitCallHeld()` (the
  `held` member of `CallKitAction` already exists).
- `useVoIPEvents.ts`: add optional `onHeldChanged?: (onHold: boolean) => void` to
  `VoIPEventHandlers`; wire from `useCallKitEvent('held', …)` on iOS and the
  `holdChanged` telecom event on Android — hold finally becomes cross-platform in the
  one hook the example actually uses.
- Example `VoipProvider.tsx`: on `onHeldChanged(true)` → mute mic + disable outbound
  video + (optionally) pause remote audio rendering; on `false` → restore. Media
  policy is deliberately JS-owned, same as theirs: the SDK reports the state, the
  app decides what "held media" means for its product.

**QA (Phase 1):** the critical test needs a real SIM device: during an active VoIP
call, receive a cellular call → the sheet must show **Hold & Accept** (iOS) → accept
→ our call holds, mic/video stop, other party sees/hears nothing → end cellular call
→ tap our call → resumes. Plus app-driven hold/unhold round-trip on both platforms,
and hold→hang-up-while-held.

## Phase 2 — Recents + call intents (iOS), Siri as byproduct

1. **Config**: new Info.plist key `FishjamVoipIncludeCallsInRecents` (bool,
   default **NO** — preserves current behavior and its privacy posture: Recents
   entries persist in the system UI and sync via iCloud). Read it in
   `CallKitManager` `init` and set
   `providerConfiguration.includesCallsInRecents` accordingly (`:37`). Plugin prop
   `voip.includeCallsInRecents` alongside the timeout props from CALL-TIMEOUTS-PLAN
   Step 4.
2. **Intent handler** — `VoipManager.m` (it already owns the "buffer things for
   cold-start JS" pattern):

   ```objc
   + (BOOL)handleContinueUserActivity:(NSUserActivity *)userActivity;
   ```

   Implementation mirrors theirs (`AppDelegateSubscriber.swift:31-92`): unwrap
   `userActivity.interaction.intent`, accept `INStartCallIntent` /
   `INStartAudioCallIntent` / `INStartVideoCallIntent`, map
   `INPersonHandleType` → `"phoneNumber" | "email" | "unknown"`, then (a) buffer as
   `pendingCallIntent` (single slot, mirroring `pendingIncomingCall`,
   `VoipManager.m:82`) and (b) fire a new `onCallIntent` block that
   `WebRTCModule+PushKit`-style glue forwards as a `voipPushEvent` payload
   `{ callIntent: { handle, handleType, isVideo } }`. Return `YES` iff handled, so
   the host AppDelegate can chain. `#import <Intents/Intents.h>` — no extra target,
   no extension.
3. **AppDelegate integration**:
   - Bare RN (document in README):

     ```objc
     - (BOOL)application:(UIApplication *)application
         continueUserActivity:(NSUserActivity *)userActivity
          restorationHandler:(void (^)(NSArray<id<UIUserActivityRestoring>> *))restorationHandler {
         if ([VoipManager handleContinueUserActivity:userActivity]) {
             return YES;
         }
         return [RCTLinkingManager application:application
                          continueUserActivity:userActivity
                            restorationHandler:restorationHandler];
     }
     ```
   - Expo: extend the config plugin with a
     [`withAppDelegate`](https://docs.expo.dev/config-plugins/plugins-and-mods/#dangerous-mods)
     source mod inserting the call before the existing `continueUserActivity` return.
     It's a string-level "dangerous mod" — accept the maintenance cost, add a
     defensive "already contains `handleContinueUserActivity`" check, and keep the
     manual snippet documented as the fallback.
4. **Info.plist `NSUserActivityTypes`**: plugin appends
   `INStartCallIntent`, `INStartAudioCallIntent`, `INStartVideoCallIntent`
   (set-union like theirs, `withExpoCallKitTelecomIos.ts:89-97`), gated on
   `voip.includeCallsInRecents || voip.enableCallIntents`.
5. **JS**: `VoIPEventHandlers.onCallIntent?: (intent: { handle: string; handleType: 'phoneNumber'|'email'|'unknown'; isVideo: boolean }) => void`
   in `useVoIPEvents.ts` (both the live event and the cold-start
   `getPendingCallIntent()` replay, mirroring the `pendingCall` replay at
   `useVoIPEvents.ts:89-104`). Example: treat `handle` (our generic handle carries
   `displayName`) as the callee and start an outgoing call to the mapped room —
   demonstrating the loop *Recents tap → app opens → call re-dials*.
6. **Siri**: nothing further. Document the honest behavior: works where Siri can
   resolve the spoken name to a handle CallKit reported. Revisit only after
   FEATURE-IDEAS #4 introduces `phoneNumber`/`email` in the caller payload —
   then `makeHandle`-style preference (theirs, `CallManager.swift:166-174`) slots
   into `reportIncomingCallWithDisplayName:` and both Recents and Siri upgrade
   without touching this phase's plumbing.

**QA (Phase 2):** call with Recents enabled → entry appears with the display name;
tap it cold (app killed) and warm → `onCallIntent` fires exactly once with the right
handle; "Hey Siri, call <name> using <app>" on a device where the name is
unambiguous; verify default-off config leaves Recents empty.

## Phase 3 — Multiple calls (call waiting) ⚠️ large, breaking

Ship 1–2 first; take this only when the product actually needs a second simultaneous
call. It is the only phase that changes existing API shapes.

### 3a. The prerequisite everything else hangs on: call identity in the JS contract

Today **no event carries a call id** (`CallKitAction`, `TelecomEvent`,
`VoIPEventHandlers`). With two calls, "ended" / "answer(requestId)" / "holdChanged"
are ambiguous. First (mechanical, additive) step:

- Native: iOS emits `callId` (`currentCallUUID.UUIDString`) in every
  `kEventCallKitActionPerformed` payload; Android adds `callId` to every
  `telecomActionPerformed` body (requires threading the UUID through
  `CallEventsListener`).
- TS: add `callId?: string` to `TelecomEvent` and restructure `CallKitAction`
  payloads to objects (`{ callId, requestId }`, `{ callId, reason }` …) — **this is
  the breaking change**; do it in one release with `useVoIPEvents` absorbing the
  difference so example-level code only gains an optional `callId` argument.
- Bridge methods gain id-taking variants: `endCallKitSession(callId, reason)`,
  `endTelecomCall(callId, reason)`, `setCallHeld(callId, onHold)`; the id-less forms
  stay as "the only/active call" conveniences.

### 3b. iOS

**`CallKitManager.m`** — replace the scalar state (`currentCallUUID`,
`isCallAnswered`, `pendingAnswerRequestId`, plus Phase 1's `isCallOnHold` and
CALL-TIMEOUTS-PLAN's single `ringTimeoutBlock`) with a registry:

```objc
@interface FJCallRecord : NSObject
@property NSUUID *uuid;
@property NSString *displayName;
@property BOOL isVideo, answered, onHold, outgoing;
@property(copy, nullable) NSString *pendingAnswerRequestId;
@property(copy, nullable) dispatch_block_t ringTimeoutBlock;
@end
// CallKitManager: NSMutableDictionary<NSUUID *, FJCallRecord *> *calls;
```

- `maximumCallGroups = 2` (`:36`); `maximumCallsPerCallGroup` stays 1;
  grouping flags stay NO; `performSetGroupCallAction` keeps failing.
- `reportIncomingCallWithDisplayName:` drops the implicit single-call assumption;
  refuse a third call (`calls.count >= 2` → report busy? No — CallKit itself
  enforces `maximumCallGroups`; still guard and log).
- **This converts CALL-TIMEOUTS-PLAN Step 1's single ring timer into the per-UUID
  design of the research doc** (`callTimeoutTasks`-equivalent): the timer block moves
  into `FJCallRecord`, cancel sites become record-scoped. Note this in that plan when
  Phase 3 starts.
- Delegate methods already receive `action.callUUID` everywhere — the changes are
  lookups instead of assumptions. The interesting new flow, **Hold & Accept**,
  arrives as one transaction containing `CXSetHeldCallAction(callA, onHold:YES)` +
  `CXAnswerCallAction(callB)`; Phase 1's per-action handlers compose correctly as
  long as both are record-scoped and JS gets `callId` on both events (3a).
- "Dismiss one of several": system UI does it natively (per-call End); the app API
  is `endCallKitSession(callId, reason)` → `CXEndCallAction` with that UUID, or the
  reported-reason branch of `endCallWithReason:` scoped to the UUID.
- `cleanup` becomes `cleanupCall:(NSUUID *)` + `cleanupAll` (provider reset);
  `FulfillRequestManager` is already request-id-keyed and needs no change;
  `VoipManager.pendingIncomingCall` single slot → small FIFO (two entries suffice).

### 3c. Android

**`voip/CallManager.kt`** — the structural refactor. Their `launchCallScope` +
`handleCallActions` (`CallManager.kt:676-748`) is the blueprint to copy:

- Singleton fields that must become per-call: `actions` channel, `displayName`,
  `videoCall`, `answered`, `pendingAnswerRequestId`, `endpointJob`/`availableJob`/
  `muteJob`, ring timer → a `CallController(job, actions, state…)` in
  `activeCalls: MutableMap<UUID, CallController>`; `hasActiveCall` becomes
  `activeCalls.isNotEmpty()`.
- Remove the `if (hasActiveCall) return` guard in `register` (`:177`) — replace with
  a two-call cap. `CallsManager.addCall` supports concurrent scopes; Telecom
  coordinates activation: answering call B triggers `onSetInactive` on call A →
  Phase 1's `onHoldChanged(true)` (now with `callId`) tells JS to pause A's media.
- `PushNotificationService` must not drop a push while a call exists (today `register`
  early-returns) — and needs event dedup before this ships (FEATURE-IDEAS #4 overlap).
- Notifications: `CallNotificationManager` currently manages one notification;
  per-call notification ids, and the incoming-call full-screen
  (`IncomingCallActivity`) should only launch when the screen is locked *and* no
  call is active — during an active call the second call must present as a heads-up
  CallStyle notification (default behavior when the screen is on) with
  answer/decline actions, which is exactly the "dismiss one of multiple" surface.
- Audio: `AudioOutputManager.setTelecomOwnsRouting` and the endpoint collectors
  assume one call — scope them to the *active* call, switching on hold-swap.
- `ForegroundServiceController` state ("connecting"/"connected") follows the active
  call only.

### 3d. JS + example

- `useVoIPEvents` handlers all gain `callId`; `VoipProvider` state becomes
  `Map<callId, CurrentCall>` with one `activeCallId`; the `pendingAnswerRequestIdRef`
  /`activationInFlightRef` pair becomes per-call (the same one-shot semantics, keyed).
- Product decision to make explicit in the example: what a **held** call's media does.
  Recommended default: stay connected to the held call's room with mic muted and
  inbound audio disabled (fast resume, costs bandwidth/battery); alternative — leave
  the room and re-join on resume (cheap, slow resume, loses in-room state). The SDK
  ships events; the example demonstrates the first policy.

**QA (Phase 3):** second incoming during active call → heads-up/system sheet on both
platforms; Hold & Accept → A held (media stopped), B live; decline B → A untouched;
end B → tap A → resumes; both ring timers independent (let B ring out while A active
→ only B ends, reason `missed`); cold-start with two queued pushes.

## Interplay with the other plans

- **CALL-TIMEOUTS-PLAN**: Phases 1–2 don't touch it. Phase 3 upgrades its single ring
  timer to the per-UUID map (both platforms) — the research doc already describes the
  target design; add a cross-reference line to that plan when Phase 3 is scheduled.
  Also Phase 1's Android note about `Activate` doubling as un-hold applies to that
  plan's Step 5 cancel site.
- **OUTGOING-CONNECT-PLAN (#2)**: independent, but its `reportCallWithUUID:updated:`
  moment (outgoing display-name update) is the natural place to also set the
  Phase 1a capability flags — coordinate to avoid two adjacent `CXCallUpdate` reports.
- **FEATURE-IDEAS #4 (payload)**: the handle-quality upgrade (`phoneNumber`/`email`)
  that makes Recents entries properly attributed and Siri actually usable lives
  there, not here.
- **FEATURE-IDEAS #6 (end reasons)**: declining call B while on call A surfaces as
  `rejected` on Android but `local` on iOS (documented gap, `Telecom.ts:22-24`) —
  more visible once two calls exist; unchanged by this plan.

## Files touched (summary)

| File | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| `ios/RCTWebRTC/CallKitManager.m` | hold flags, `setCallHeld`, state | `includesCallsInRecents` read | registry refactor, `maximumCallGroups=2` |
| `ios/RCTWebRTC/WebRTCModule+CallKit.m` | 2 methods | — | id-taking variants, `callId` in events |
| `ios/RCTWebRTC/VoipManager.m` | — | intent handler + pending buffer | pending buffer → FIFO |
| `android/.../voip/CallManager.kt` | `setCallHeld`, lambda wiring, listener | — | per-call controller refactor |
| `android/.../TelecomController.java` + `WebRTCModule.java` | holdChanged event, 2 methods | — | `callId` everywhere, id-taking variants |
| `src/CallKit.ts`, `src/Telecom.ts`, `src/useVoIPEvents.ts` | hold APIs + `holdChanged` + `onHeldChanged` | `onCallIntent` + pending replay | breaking payload change, per-call handlers |
| `packages/mobile-client/plugin` | — | Recents/intents props, `NSUserActivityTypes`, AppDelegate mod | — |
| example `VoipProvider.tsx` | hold → mute wiring | Recents re-dial demo | multi-call state |

No changes in any phase to: `FulfillRequestManager` (either platform),
`PushNotificationService` (until Phase 3), `IncomingCallActivity` (until Phase 3).
