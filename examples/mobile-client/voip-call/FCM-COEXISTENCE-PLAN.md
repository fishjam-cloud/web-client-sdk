# Plan: FCM messaging-service coexistence (Android)

> Companion to [FEATURE-IDEAS.md](./FEATURE-IDEAS.md) item #7 (⏸ DEFERRED). That item holds
> the original single-forwarder design; this file adds research into how other VoIP/chat
> SDKs solve the problem (verified 2026-07-10, extended 2026-07-15 with Agora) and a
> phased plan whose primary mechanism is **zero-config on both Expo and bare RN**
> (runtime forwarding), with a dispatcher escape hatch for multiple notification
> libraries and payload interception.

## Problem (recap)

Android delivers each FCM message to **exactly one** service per app — the first
`com.google.firebase.MESSAGING_EVENT` match in the merged manifest
([FirebaseMessagingService](https://firebase.google.com/docs/reference/android/com/google/firebase/messaging/FirebaseMessagingService)).
Our `PushNotificationService` claims that slot and consumes everything, so a host app that
also uses expo-notifications / `@react-native-firebase/messaging` / Notifee / OneSignal
loses either its notifications or our calls, plus `onNewToken` on the losing side.
iOS is unaffected — VoIP pushes ride PushKit's separate channel (see FEATURE-IDEAS #7).

## Research: how other SDKs solve it

### Twilio Voice React Native SDK — built-in service + opt-out flag + handler API
[@twilio/voice-react-native-sdk](https://github.com/twilio/twilio-voice-react-native)
documents this exact problem since v1.2.1 in
[out-of-band-firebase-messaging-service.md](https://github.com/twilio/twilio-voice-react-native/blob/main/docs/out-of-band-firebase-messaging-service.md):
- Built-in `FirebaseMessagingService` is ON by default (zero-config path).
- Opt-out via a **boolean resource** in the app
  (`<bool name="twiliovoicereactnative_firebasemessagingservice_enabled">false</bool>` in
  `android/app/src/main/res/values/config.xml`) — needed because their service lives in the
  **library** manifest and can't simply be un-declared.
- Escape hatch is a JS API — `voice.handleFirebaseMessage(remoteMessage.data)` returns
  `Promise<boolean>` (`true` = it was a Twilio call push) — wired inside
  `@react-native-firebase/messaging`'s
  [`onMessage`](https://rnfirebase.io/reference/messaging#onMessage) /
  [`setBackgroundMessageHandler`](https://rnfirebase.io/reference/messaging#setBackgroundMessageHandler).
- ⚠️ The out-of-band path depends on RNFB **headless JS** in killed state — see
  [issue #445](https://github.com/twilio/twilio-voice-react-native/issues/445) (crash
  answering from killed state) and
  [issue #370](https://github.com/twilio/twilio-voice-react-native/issues/370).

### Agora — no service at all; developer-owned service + SDK helpers (docs-only)
Agora's RTC/video SDK has **no push layer whatsoever** — for call invitations they point
you at your own signaling + FCM and (for RN) community patterns around
[react-native-callkeep](https://github.com/react-native-webrtc/react-native-callkeep)
with RNFB background messaging ([Agora FAQ](https://docs.agora.io/en/faq/call_invite_notification)).
Agora **Chat** likewise ships no service: the developer writes their own
`FirebaseMessagingService`, overrides `onNewToken`, and calls SDK helpers such as
`ChatClient.getInstance().sendFCMTokenToServer(token)`
([Integrate offline push](https://docs.agora.io/en/agora-chat/develop/offline-push/integrate-test)).
Coexistence is trivially the developer's job — the SDK only provides token/parse
entry points. Sendbird's chat SDK follows the identical pattern
(`isSendbirdMessage(remoteMessage)` + `markAsDelivered`,
[Sendbird FCM docs](https://sendbird.com/docs/chat/sdk/v4/android/push-notifications/multi-device-support/set-up-push-notifications-for-fcm)).

### Stream (GetStream) Video React Native SDK — no native service, JS helpers
Ships **no** `FirebaseMessagingService`; mandates `@react-native-firebase/messaging` and
exposes JS helpers — discriminator `isFirebaseStreamVideoMessage(msg)` + processor
`firebaseDataHandler(msg.data)` — called inside `onMessage` / `setBackgroundMessageHandler`
([push docs](https://getstream.io/video/docs/react-native/incoming-calls/other-than-ringing-setup/react-native/)).
Perfect coexistence by construction, but killed-state handling rides RNFB's headless JS
task — slower to post the CallStyle notification and subject to OEM battery kills.

### expo-callkit-telecom — inheritance, single hard-coded partner
`ExpoCallKitTelecomMessagingService extends ExpoFirebaseMessagingService`
(expo-notifications' service); non-call messages go to `super.onMessageReceived()`; config
plugin strips expo-notifications' own service with
[`tools:node="remove"`](https://developer.android.com/build/manage-manifests#node_markers).
Zero config for Expo apps, but compile-time-coupled to expo-notifications only; not
transferable to bare RN.

### Pattern summary

| | Native service? | Multiple PN libs? | Payload interception? | Killed-state robustness |
|---|---|---|---|---|
| Twilio Voice RN | yes + opt-out flag | ✅ via JS dispatcher | ✅ JS | ✅ native default / ⚠️ JS out-of-band |
| Agora (RTC & Chat) | no — developer-owned | ✅ by construction | ✅ native (yours) | ✅ native (yours) |
| Stream Video RN | no | ✅ via JS dispatcher | ✅ JS | ⚠️ headless JS only |
| expo-callkit-telecom | yes (subclass) | ❌ expo-notifications only | ❌ | ✅ native |
| **Ours (planned)** | yes + trivial opt-out | ✅ native dispatcher (+ opt. fwd) | ✅ native | ✅ native in every mode |

**Industry consensus:** a payload discriminator + a public `handleMessage(...): Boolean`
helper + a **developer-owned dispatcher service** is the standard answer (Twilio, Agora,
Sendbird, Stream all converge on it — differing only in whether the helper is JS or
native and whether a default service ships at all).

## What we already have (checked 2026-07-15)

Two facts make a **docs-first** solution unusually cheap for us:

1. **Our service is declared in the *app* manifest** (bare-RN snippet + `withFishjamVoip.ts`),
   not the library manifest. So "opting out" is just *not declaring it* (or a plugin prop) —
   we don't need Twilio's boolean-resource trick at all.
2. **The native entry points are already public**: `CallManager.reportIncomingCall(...)`
   (`CallManager.kt:122`, public `object`) and `VoipPushRegistry.updateToken` /
   `reportIncoming` / `bufferWaitingIncoming` (`VoipPushRegistry.kt`, public `object`).
   A host-owned service *could* already call them — but the dispatch logic in
   `PushNotificationService.onMessageReceived` is no longer trivial (parses
   `roomName`/`displayName`/`handle`/`isVideo`/`avatarUrl`, handles the
   `IncomingCallSlot.CURRENT/WAITING/REJECTED` call-waiting outcomes, private
   `warmUpReact()`), so a copy-paste recipe would rot. **One small helper fixes that.**

Note the payload already has a natural discriminator: a message is "ours" iff it carries
`roomName`. An explicit `voip: "true"` flag stays optional polish, not a prerequisite.

## Plan — phased

> **Constraint that sets the order (2026-07-15): must be zero-friction on BOTH Expo and
> bare RN.** The dispatcher pattern requires the user to write a Kotlin service — fine in
> bare RN, but Expo (CNG/prebuild) apps have no `android/` folder; they'd need a local
> module or custom plugin (Twilio's Expo support is an open issue,
> [#496](https://github.com/twilio/twilio-voice-react-native/issues/496)). Runtime
> forwarding is the only mechanism with zero user code on both, so it is **Phase 1**;
> the dispatcher helpers become the documented escape hatch for bare-RN power users.

### Phase 1 (primary ship): discriminator gate + runtime forwarding + public helpers
The original FEATURE-IDEAS #7 design, now the core mechanism because it is the only
Expo-and-bare-compatible zero-config option:
- `PushNotificationService` handles only messages carrying the VoIP discriminator
  (`roomName` today; explicit `voip: "true"` optional polish).
- Non-VoIP messages **and** token callbacks are forwarded to the next `MESSAGING_EVENT`
  service found via
  [`queryIntentServices`](https://developer.android.com/reference/android/content/pm/PackageManager#queryIntentServices(android.content.Intent,%20int))
  (reflective instantiation + `attachBaseContext`) — works with expo-notifications, RNFB,
  Notifee, OneSignal… with no compile-time coupling and no user code. Forward to the
  *next* service only (fan-out risks duplicate handling). The forwarded library keeps its
  own native killed-state behavior — its real service code runs, just invoked by us.
- Expo: `withFishjamVoip` already injects our service → coexistence with
  expo-notifications works with **no new config**. Bare RN: the README manifest snippet,
  same result. Add `android:priority="1"` in both.

**Also in Phase 1 (~20-line refactor the forwarding needs anyway):** extract the public
companion helpers on `PushNotificationService`:

```kotlin
companion object {
    /** Returns true iff the message was a Fishjam VoIP push and was handled. */
    fun handleVoipMessage(context: Context, message: RemoteMessage): Boolean
    fun handleNewToken(token: String)
}
```

The service's own overrides become one-liners delegating to the helpers, so example-app
behavior is unchanged and there is nothing new to test beyond compilation.

**Documentation:** a "Using other push-notification libraries" section in the SDK README /
example README §9. The zero-config forwarding covers the common case; this documents the
**escape hatch** for bare-RN apps with several push SDKs or payload-interception needs:

```kotlin
// The app's single messaging service — replaces the SDK's service in the manifest.
class MyMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        if (PushNotificationService.handleVoipMessage(this, message)) return
        // full interception point — inspect/route message.data however you like
        MyChatSdk.handle(message)          // chain any number of other SDKs
    }
    override fun onNewToken(token: String) {
        PushNotificationService.handleNewToken(token)
        MyChatSdk.onNewToken(token)
    }
}
```

- Document the two setups: (a) default — our service + automatic forwarding, zero config
  on Expo and bare RN alike; (b) advanced — declare *your* service instead and call the
  helper first (bare RN directly; Expo via a local module or custom plugin).
- Document why the chain must be **native**, not JS: a killed app receives the FCM
  wake-up before any JS runs, and the CallStyle notification must post within Telecom's
  window (this is where Twilio's JS out-of-band route shows cracks — #445).
- Warn about libraries that auto-register a service from their **library** manifest
  (RNFB messaging does): the app-manifest service wins the merge
  ([merge priorities](https://developer.android.com/build/manage-manifests#merge_priorities));
  `android:priority="1"` (or `tools:node="remove"` on the library one) makes it explicit.

**Expo plugin:** add `android.voipMessagingService?: boolean` (default `true`) to
`withFishjamVoip.ts` so users bringing their own dispatcher can skip injecting our
service. (Later, if demand shows: a plugin mode that *generates* the dispatcher service
for Expo apps with a configurable delegate list.)

This single phase beats every surveyed SDK: zero-config coexistence on both Expo and
bare RN (none of them offer that), plus the industry-standard dispatcher escape hatch.

### Phase 2 (optional polish)
- Explicit `voip: "true"` payload flag (server + docs) as a cleaner discriminator than
  "has `roomName`".
- JS-level `handleVoipMessage(data)` wrapper for RNFB-centric apps (Twilio-style), shipped
  **explicitly second-class** with the killed-state caveat documented.

## Implementation checklist

Phase 1:
- [ ] `PushNotificationService.kt`: discriminator gate; runtime forwarding
      (`nextMessagingService()` via `queryIntentServices`, reflective `attachBaseContext`)
      for unhandled messages + `onRegistered`/`onNewToken`; extract public companion
      helpers
- [ ] SDK / example README §9: "Using other push-notification libraries" section
      (zero-config default, dispatcher recipe, native-not-JS rationale, manifest-merge note)
- [ ] example `AndroidManifest.xml` + README snippet + `withFishjamVoip.ts`:
      `android:priority="1"`; `android.voipMessagingService` prop (default `true`)
- [ ] Compile check: `JAVA_HOME=~/.sdkman/candidates/java/17.0.18-zulu ./gradlew
      :fishjam-cloud_react-native-webrtc:compileDebugKotlin` (from `examples/mobile-client/voip-call/app/android`)
- [ ] Device test with a second messaging service registered (e.g. RNFB or
      expo-notifications) in both winner orders

iOS: **no change in any phase** — PushKit isolation verified (FEATURE-IDEAS #7); a payload
gate on iOS would violate the report-a-call rule
([pushRegistry(_:didReceiveIncomingPushWith:for:completion:)](https://developer.apple.com/documentation/pushkit/pkpushregistrydelegate/pushregistry(_:didreceiveincomingpushwith:for:completion:))).

## Open questions

- Should `handleVoipMessage` also accept a raw `Map<String, String>` overload for hosts
  that transform payloads before dispatch?
- Bare-RN docs currently instruct declaring our service directly — should the coexistence
  section become the *primary* documented path (dispatcher-first, like Agora), with our
  service as the convenience shortcut?
