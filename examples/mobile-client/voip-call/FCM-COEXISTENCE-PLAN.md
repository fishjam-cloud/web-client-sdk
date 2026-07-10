# Plan: FCM messaging-service coexistence (Android)

> Companion to [FEATURE-IDEAS.md](./FEATURE-IDEAS.md) item #7 (⏸ DEFERRED). That item holds
> the original single-forwarder design; this file extends it with research into how other
> VoIP SDKs solve the problem and a layered plan that supports **multiple** push-notification
> libraries and lets the host app **intercept or forward** payloads.

## Problem (recap)

Android delivers each FCM message to **exactly one** service per app — the first
`com.google.firebase.MESSAGING_EVENT` match in the merged manifest
([FirebaseMessagingService](https://firebase.google.com/docs/reference/android/com/google/firebase/messaging/FirebaseMessagingService)).
Our `PushNotificationService` claims that slot and consumes everything, so a host app that
also uses expo-notifications / `@react-native-firebase/messaging` / Notifee / OneSignal
loses either its notifications or our calls, plus `onNewToken` on the losing side.
iOS is unaffected — VoIP pushes ride PushKit's separate channel (see FEATURE-IDEAS #7).

## Research: how other SDKs solve it (verified 2026-07-10)

### expo-callkit-telecom — inheritance, single hard-coded partner
`ExpoCallKitTelecomMessagingService extends ExpoFirebaseMessagingService`
(expo-notifications' service); non-call messages go to `super.onMessageReceived()`, and the
config plugin strips expo-notifications' own service with
[`tools:node="remove"`](https://developer.android.com/build/manage-manifests#node_markers).
- ✅ Zero config for Expo apps; token callbacks chain via `super.onNewToken()`.
- ❌ Compile-time dependency on expo-notifications; coexists with **only** that library;
  requires Expo prebuild. Not transferable to bare RN.

### Twilio Voice React Native SDK — built-in service + opt-out + JS handler API
Contrary to first impressions, Twilio **does** ship a React Native SDK
([@twilio/voice-react-native-sdk](https://github.com/twilio/twilio-voice-react-native)), and
since v1.2.1 it documents this exact problem in
[out-of-band-firebase-messaging-service.md](https://github.com/twilio/twilio-voice-react-native/blob/main/docs/out-of-band-firebase-messaging-service.md):
- Built-in `FirebaseMessagingService` is ON by default (zero-config path).
- Opt-out via a **boolean resource** — the app adds `android/app/src/main/res/values/config.xml`:
  ```xml
  <bool name="twiliovoicereactnative_firebasemessagingservice_enabled">false</bool>
  ```
  (no manifest surgery needed — the service checks the flag at runtime).
- Escape hatch is a **JS API**: `voice.handleFirebaseMessage(remoteMessage.data)` returns
  `Promise<boolean>` (`true` = it was a Twilio call push). The user wires it inside
  `@react-native-firebase/messaging`'s
  [`onMessage`](https://rnfirebase.io/reference/messaging#onMessage) /
  [`setBackgroundMessageHandler`](https://rnfirebase.io/reference/messaging#setBackgroundMessageHandler).
- ⚠️ Known weakness: the out-of-band path depends on RNFB's **headless JS** in killed
  state — see [issue #445](https://github.com/twilio/twilio-voice-react-native/issues/445)
  (crash answering from killed state via out-of-band service) and
  [issue #370](https://github.com/twilio/twilio-voice-react-native/issues/370)
  (adding RNFB breaks incoming calls until you go out-of-band).

### Stream (GetStream) Video React Native SDK — no native service at all
Stream ships **no** `FirebaseMessagingService`. It mandates
`@react-native-firebase/messaging` and exposes JS helpers — a payload discriminator
`isFirebaseStreamVideoMessage(msg)` and a processor `firebaseDataHandler(msg.data)` — that
the user calls inside `onMessage` / `setBackgroundMessageHandler`
([push notification docs](https://getstream.io/video/docs/react-native/incoming-calls/other-than-ringing-setup/react-native/)).
- ✅ Perfect coexistence by construction: the app owns the single handler and chains any
  number of SDKs; full payload interception.
- ❌ Forces an RNFB dependency; killed-state handling rides RNFB's headless JS task —
  slower to post the CallStyle notification than a native service, and subject to OEM
  battery-optimization kills.

### Pattern summary

| | Native service? | Multiple PN libs? | Payload interception? | Killed-state robustness |
|---|---|---|---|---|
| expo-callkit-telecom | yes (subclass) | ❌ expo-notifications only | ❌ | ✅ native |
| Twilio Voice RN | yes + opt-out flag | ✅ via JS dispatcher | ✅ JS | ✅ native default / ⚠️ JS out-of-band |
| Stream Video RN | no | ✅ via JS dispatcher | ✅ JS | ⚠️ headless JS only |
| **Ours (planned)** | yes + opt-out | ✅ native fwd + dispatcher | ✅ native + JS | ✅ native in every mode |

Industry consensus: **a payload discriminator + a public `handleMessage(data): Boolean`
helper + user-owned dispatcher service** is the standard escape hatch. Nobody else offers
automatic *native* forwarding to an unknown next service — that part of our design is a
genuine differentiator (better zero-config story than any of the above).

## Plan — three layers, all compatible

### Layer 1 (default, zero config): gated native service with runtime forwarding
The deferred design from FEATURE-IDEAS #7, unchanged:
1. Server adds `voip: "true"` to the FCM data payload; `PushNotificationService` only
   handles messages carrying it.
2. Everything else (messages **and** `onNewToken`) is forwarded to the next
   `MESSAGING_EVENT` service found via
   [`queryIntentServices`](https://developer.android.com/reference/android/content/pm/PackageManager#queryIntentServices(android.content.Intent,%20int)),
   instantiated reflectively with the app context attached.
3. `android:priority="1"` on our intent-filter (app manifest, via `withFishjamVoip.ts` and
   the bare-RN docs snippet) makes us deterministically first.

Covers: no other PN library, or exactly one — the 90% case — with native killed-state
handling and no work from the user.

### Layer 2 (multiple libraries / interception): public native helpers + host-owned dispatcher
Promote the companion helpers to documented public API:
```kotlin
// in PushNotificationService.companion
fun handleVoipMessage(context: Context, message: RemoteMessage): Boolean  // true = was a VoIP push, call reported
fun handleNewToken(token: String)
```
Documented recipe (mirrors Twilio/Stream, but the handler chain runs in **native**, so
killed-state timing is not compromised):
```kotlin
class MyMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        if (PushNotificationService.handleVoipMessage(this, message)) return
        // full interception point: inspect/mutate/route message.data here
        MyChatSdk.handle(message)     // any number of other SDKs, user-chosen order
    }
    override fun onNewToken(token: String) {
        PushNotificationService.handleNewToken(token)
        MyChatSdk.onNewToken(token)
    }
}
```
The user's service lives in the **app manifest**, so it outranks ours automatically
([merge priorities](https://developer.android.com/build/manage-manifests#merge_priorities));
with an explicit disable (Layer 3) there's no ambiguity at all.

### Layer 3: clean opt-out of the built-in service
Adopt Twilio's **boolean-resource** mechanism — better than manifest surgery because it
needs no `tools:` namespace and works identically in bare RN and Expo:
- Our service reads `R.bool.fishjam_voip_messaging_service_enabled` (default `true`,
  defined in the library's `res/values`) at the top of `onMessageReceived`/`onNewToken`
  and immediately delegates/forwards when `false`.
- Bare RN: app overrides it in `android/app/src/main/res/values/config.xml`.
- Expo: `withFishjamVoip` prop `android.voipMessagingService: false` (plugin then also
  skips injecting our service into the manifest — cleaner than the runtime check alone).

### Optional Layer 4 (later, if asked): JS-level handler for RNFB users
A JS `handleVoipMessage(data): Promise<boolean>` wrapper (Twilio-style) so RNFB-centric
apps can keep a pure-JS dispatcher. **Explicitly second-class**: document that killed-state
delivery then depends on RNFB headless JS (Twilio #445-class issues), and recommend the
Layer 2 native dispatcher for production.

## Implementation checklist (when un-deferred)

- [ ] `PushNotificationService.kt`: `voip:"true"` gate; runtime forwarding
      (`nextMessagingService()` via `queryIntentServices`, reflective `attachBaseContext`);
      public companion helpers; `fishjam_voip_messaging_service_enabled` check
- [ ] library `res/values/config.xml`: `fishjam_voip_messaging_service_enabled = true`
- [ ] `server/main.ts`: add `voip: "true"` to FCM data; update payload docs in both READMEs
- [ ] example `AndroidManifest.xml` + README §9 snippet: `android:priority="1"`
- [ ] `withFishjamVoip.ts`: priority on injected intent-filter; `voipMessagingService` prop
- [ ] Docs: coexistence section — Layer 1 default, Layer 2 dispatcher recipe, Layer 3 opt-out
- [ ] iOS: **no change** (PushKit isolation verified — see FEATURE-IDEAS #7; a payload gate
      on iOS would violate the report-a-call rule,
      [pushRegistry(_:didReceiveIncomingPushWith:for:completion:)](https://developer.apple.com/documentation/pushkit/pkpushregistrydelegate/pushregistry(_:didreceiveincomingpushwith:for:completion:)))
- [ ] Verify: compile (`JAVA_HOME=~/.sdkman/candidates/java/17.0.18-zulu ./gradlew
      :fishjam-cloud_react-native-webrtc:compileDebugKotlin`), then a device test with a
      second messaging service registered (e.g. RNFB) in both winner orders

## Open questions

- Forward non-VoIP messages to the **next** service only (Android-semantics-faithful,
  current design) or to **all** other registered services? Next-only recommended;
  fan-out risks duplicate notifications when two libraries both display the same message.
- Should Layer 2's `handleVoipMessage` also accept a raw `Map<String, String>` overload for
  hosts that transform payloads before dispatch?
