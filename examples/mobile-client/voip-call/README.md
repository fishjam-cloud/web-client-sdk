# VoIP Push Notifications — setup

Sections 1–8 cover **iOS** (APNs + PushKit + CallKit). Android is covered in
[section 9](#9-android-setup) and uses a completely separate transport:
FCM instead of APNs, Telecom instead of CallKit.

This document lists everything the **app** has to change to receive VoIP push
notifications and surface them as CallKit calls. Most of the heavy lifting lives
in the `@fishjam-cloud/react-native-webrtc` pod; the app only has to (1) register
for VoIP pushes and (2) declare the right capabilities.

## How the flow works

```
APNs VoIP push
  → iOS wakes the app (even if killed)               UIBackgroundModes: voip
  → PKPushRegistry delegate                          VoipManager (pod)
      → reports the call to CallKit                  CallKitManager (pod)  → system call UI
      → fires onIncomingPush block                   WebRTCModule+PushKit (pod)
          → sendEventWithName("callKitActionPerformed", {incoming})  → JS
  → user answers / ends on the CallKit UI
      → CallKitManager callbacks                     WebRTCModule+CallKit (pod)
          → JS events: answer / ended / muted / held
```

What the **pod already does for you** (no app code needed):

- `PKPushRegistry` + `PKPushRegistryDelegate` — `VoipManager.m`.
- Reporting the incoming call to CallKit on push receipt —
  `VoipManager.m` → `[[CallKitManager shared] reportIncomingCallWithDisplayName:isVideo:]`.
- Bridging native → JS events. `WebRTCModule` subclasses `RCTEventEmitter`; when
  JS adds its first listener, `startObserving` runs and calls
  `startObservingPushKit` (`WebRTCModule+PushKit.m`), which wires the
  `registered` (VoIP token) and `incoming` (push payload) events. See
  [`RCTEventEmitter`](https://reactnative.dev/docs/legacy/native-modules-ios#sending-events-to-javascript).

What the **app must do** is below.

---

## 1. AppDelegate — register for VoIP pushes

The pod never registers `PKPushRegistry` on its own (a push can wake the app
before any JS is running, so registration must happen at launch). Add the call
in `application(_:didFinishLaunchingWithOptions:)`.

`ios/voipcall/AppDelegate.swift`:

```swift
public override func application(
  _ application: UIApplication,
  didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
) -> Bool {
  let delegate = ReactNativeDelegate()
  let factory = ExpoReactNativeFactory(delegate: delegate)
  delegate.dependencyProvider = RCTAppDependencyProvider()

  reactNativeDelegate = delegate
  reactNativeFactory = factory
  bindReactNativeFactory(factory)

  // 👇 Register for VoIP pushes as early as possible.
  VoipManager.registerForVoIPPushes()

#if os(iOS) || os(tvOS)
  window = UIWindow(frame: UIScreen.main.bounds)
  factory.startReactNative(
    withModuleName: "main",
    in: window,
    launchOptions: launchOptions)
#endif

  return super.application(application, didFinishLaunchingWithOptions: launchOptions)
}
```

> Registration triggers the APNs handshake. Once the VoIP token is issued, the
> pod forwards it to JS as the `registered` event. Because the token may arrive
> before your component mounts, prefer reading it on demand rather than relying
> only on catching the event.

## 2. Bridging header — expose the pod's class to Swift

`VoipManager` is Objective-C; Swift needs it imported through the bridging
header. `ios/voipcall/voipcall-Bridging-Header.h`:

```objc
//
// Use this file to import your target's public headers that you would like to expose to Swift.
//
#import "VoipManager.h"
```

> If `"VoipManager.h"` doesn't resolve, use the pod-qualified form instead:
> `#import <FishjamReactNativeWebrtc/VoipManager.h>`.

## 3. Entitlements — Push Notifications

`ios/voipcall/voipcall.entitlements` must contain the `aps-environment` key
(add the **Push Notifications** capability in Xcode → Signing & Capabilities,
which writes this for you). Already present in this app:

```xml
<key>aps-environment</key>
<string>development</string>   <!-- use "production" for TestFlight / App Store -->
```

## 4. Info.plist — background modes & permissions

`ios/voipcall/Info.plist` needs (all already present in this app):

```xml
<key>UIBackgroundModes</key>
<array>
  <string>voip</string>      <!-- required: lets a VoIP push wake the app -->
  <string>processing</string>
  <!-- add <string>audio</string> if you keep an audio session alive during the call -->
</array>

<key>NSMicrophoneUsageDescription</key>
<string>Allow $(PRODUCT_NAME) to access your microphone.</string>
```

Optional native timeout values are numeric `Info.plist` entries:

```xml
<key>FishjamVoipIncomingCallTimeout</key>
<integer>45</integer>
<key>FishjamVoipOutgoingCallTimeout</key>
<integer>60</integer>
<key>FishjamVoipFulfillAnswerTimeout</key>
<integer>10</integer>
```

They are used when the Expo plugin is not managing the values. Omit any key to
use its native default.

In Xcode → Signing & Capabilities this corresponds to **Background Modes →
Voice over IP** and **Push Notifications**.

### 4.1 iOS Recents and tap-to-redial

Recents are opt-in because entries persist in the system Phone app and may sync
through iCloud. Set `FishjamVoipIncludeCallsInRecents` to `true`:

```xml
<key>FishjamVoipIncludeCallsInRecents</key>
<true/>
```

To make a Recents entry open the app and start a new call, add the CallKit intent
activity types:

```xml
<key>NSUserActivityTypes</key>
<array>
  <string>INStartCallIntent</string>
  <string>INStartAudioCallIntent</string>
  <string>INStartVideoCallIntent</string>
</array>
```

Then forward those activities to the native module **before** React Native Linking
or Expo handles them. Keep the existing fallback chain so universal links still
work:

```swift
public override func application(
  _ application: UIApplication,
  continue userActivity: NSUserActivity,
  restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
) -> Bool {
  if VoipManager.handleContinueUserActivity(userActivity) {
    return true
  }

  let result = RCTLinkingManager.application(
    application,
    continue: userActivity,
    restorationHandler: restorationHandler
  )
  return super.application(
    application,
    continue: userActivity,
    restorationHandler: restorationHandler
  ) || result
}
```

This uses the same iOS intent path as Siri, but the SDK does not add Siri
vocabulary, shortcuts, or other Siri-specific product behavior.

With the Fishjam Expo plugin, use:

```json
{
  "voip": {
    "includeCallsInRecents": true
  }
}
```

The plugin writes the two `Info.plist` settings and inserts the AppDelegate
forwarder for Swift Expo AppDelegates. It does not replace the required
`VoipManager` bridging-header import or the early
`VoipManager.registerForVoIPPushes()` registration shown above.

### 4.2 Hold behavior

No AppDelegate or `Info.plist` change is required for hold. The SDK exposes
CallKit/Core-Telecom hold events through `useVoIPEvents`:

```ts
useVoIPEvents({
  onHeldChanged: async (onHold) => {
    if (onHold) {
      await stopMicrophone();
      await stopCamera();
    } else {
      await startCamera();
      await startMicrophone();
    }
  },
});
```

The application owns the media policy. The example stops its microphone and
outbound camera while held, then restores them when resumed. To initiate hold
from custom UI, use `useCallKit().setCallHeld(onHold)` on iOS or
`useTelecom().setCallHeld(onHold)` on Android.

---

## 5. Server / APNs side

- Create a **VoIP Services certificate** (or use an APNs Auth Key) in the Apple
  Developer portal. VoIP pushes use a dedicated token, not the regular APNs one.
  See Apple's [PushKit](https://developer.apple.com/documentation/pushkit) and
  [Reporting incoming calls](https://developer.apple.com/documentation/callkit/cxprovider)
  docs.
- Send the push with header `apns-push-type: voip` and `apns-topic:
<bundle-id>.voip`, to the VoIP token your app reported via the `registered`
  event.
- Payload fields the pod reads (`VoipManager.m`):

  ```json
  { "displayName": "Alice", "isVideo": false }
  ```

  `username` is accepted as a fallback for `displayName`. The entire payload is
  also forwarded to JS as the `incoming` event, so you can include routing data
  (e.g. `roomId`).

> iOS 13+ requires that **every** received VoIP push reports an incoming call to
> CallKit, immediately, inside the push handler — otherwise the system
> terminates the app. The pod already does this for you.

---

## 6. JS side — subscribe to events

```ts
import {
  failIncomingCallConnected,
  fulfillIncomingCallConnected,
  useVoIPEvents,
} from "@fishjam-cloud/react-native-client";

useVoIPEvents({
  onIncoming: (payload) => console.log("incoming push:", payload),
  onAnswered: async (requestId) => {
    try {
      await joinRoom();
      await waitForRemoteMedia();
      const connected = await fulfillIncomingCallConnected(requestId);
      if (!connected) return; // The native timeout already ended the call.
    } catch {
      await failIncomingCallConnected(requestId);
    }
  },
  onEnded: (reason) => console.log("ended:", reason),
  onRegistered: (token) => console.log("VoIP token:", token),
});
```

Answering parks the native CallKit/Core-Telecom action in a `connecting` state.
Call `fulfillIncomingCallConnected` only when remote media is live; call
`failIncomingCallConnected` if token fetching or room setup fails. The native
handshake has a fixed 10-second deadline covering JS startup, token fetching,
and room join. If it is not fulfilled in time, the call ends as failed.

### 6.1 Outgoing calls

Starting an outgoing call (`useCallKit().startCallKitSession` on iOS,
`useTelecom().startCall` on Android) reports it to CallKit / Core-Telecom right
away, so the OS shows "Calling…" — but **no call timer runs yet**. Call
`reportOutgoingCallConnected()` only once the callee's media is actually live
(the same "first remote peer joined the room" signal used for the answer side);
that is what starts the CallKit / Core-Telecom call timer, so the dynamic
island, status bar, lock screen, and Android's shade all report the real
conversation duration instead of counting from the moment you dialed:

```ts
import { reportOutgoingCallConnected } from "@fishjam-cloud/react-native-client";

await startCallKitSession({ displayName: "Alice", isVideo: false }); // startCall on Android
await joinRoom();
// ...wait for the callee's track to appear in the room...
await reportOutgoingCallConnected();
```

It is a cross-platform no-op if there is no active outgoing call — including
during an incoming call, and after the call has already ended (e.g. via the
outgoing timeout below). See the `remotePeers` effect in
[`VoipProvider.tsx`](./app/src/voip/VoipProvider.tsx), which calls it for
outgoing calls from the same place `fulfillIncomingCallConnected` is called
for incoming ones.

If the callee never answers, the native outgoing timeout (default 60 seconds,
configurable via `FishjamVoipOutgoingCallTimeout` / the `voip.outgoingCallTimeout`
plugin option — see [section 9.1](#91-enable-the-plugin-option)) ends the call
as `missed` on both platforms, so the caller never sees an indefinitely
"Calling…" screen.

---

## 7. Expo caveat

This `ios/` directory is generated by `expo prebuild`. Direct edits to
`AppDelegate.swift`, `Info.plist`, the entitlements, and the bridging header
**will be overwritten by `expo prebuild --clean`**. For a durable setup, move
these changes into an [Expo config plugin](https://docs.expo.dev/config-plugins/introduction/)
(`withAppDelegate`, `withInfoPlist`, `withEntitlementsPlist`) so they are
re-applied on every prebuild.

---

## 8. Testing

1. Run on a **real device** (VoIP pushes don't work on the Simulator).
2. Launch the app and confirm `VoIP token:` is logged — that token is your push
   destination.
3. Send a VoIP push to that token (e.g. via a script using your VoIP key, or a
   tool like Pusher/Knuff). The CallKit incoming-call UI should appear even if
   the app is backgrounded or killed.
4. Tap **Answer** / **End** on the system UI and confirm the `answer` / `ended`
   events log in Metro.
5. With `includeCallsInRecents` enabled, complete a call and confirm that it
   appears in Phone → Recents. Tap its entry while the app is backgrounded and
   after it has been terminated; the app should reopen and invoke
   `onCallIntent` exactly once.
6. During an active VoIP call, receive a cellular call and select **Hold &
   Accept**. Verify that the VoIP microphone and camera stop, then resume when
   the cellular call ends and the VoIP call is made active again.

---

## 9. Android setup

Android does not use APNs or CallKit. Incoming calls arrive as **FCM** messages and
are surfaced through **Telecom**, so Firebase must be configured. VoIP on Android is
opt-in, and turning it on requires **two** things in `app.json`. Setting only one of
them leaves you with a build that either fails or silently never rings.

### 9.1 Enable the plugin option

`android.enableVoip` makes the Fishjam config plugin inject the VoIP manifest entries
— the `MANAGE_OWN_CALLS` / `POST_NOTIFICATIONS` / `USE_FULL_SCREEN_INTENT` / `VIBRATE`
permissions, `IncomingCallActivity`, `EndCallNotificationReceiver`, and the
`PushNotificationService` that receives the FCM wake-up push:

```json
"plugins": [
  [
    "@fishjam-cloud/react-native-client",
    {
      "android": {
        "enableVoip": true
      },
      "ios": {
        "enableVoIPBackgroundMode": true
      },
      "voip": {
        "incomingCallTimeout": 45,
        "outgoingCallTimeout": 60,
        "fulfillAnswerCallTimeout": 10,
        "includeCallsInRecents": true
      }
    }
  ]
]
```

All `voip` timeout properties are optional positive finite seconds. The defaults
are 45 seconds for incoming ringing, 60 seconds for unconnected outgoing calls,
and 10 seconds for the answer-fulfillment handshake. A ring timeout ends the
call with the existing `missed` reason.

### 9.2 Point Expo at `google-services.json`

`android.googleServicesFile` is what actually wires Firebase into the native build:

```json
"android": {
  "package": "io.fishjam.example.voipcall",
  "googleServicesFile": "./google-services.json",
  "edgeToEdgeEnabled": true,
  "permissions": [
    "android.permission.CAMERA",
    "android.permission.RECORD_AUDIO",
    "android.permission.MODIFY_AUDIO_SETTINGS",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.ACCESS_WIFI_STATE"
  ]
}
```

On every `expo prebuild`, Expo's built-in Android mods read this one field and then:

1. add `classpath 'com.google.gms:google-services'` to `android/build.gradle`,
2. append `apply plugin: 'com.google.gms.google-services'` to `android/app/build.gradle`,
3. copy your file to `android/app/google-services.json`.

At build time the Gradle plugin turns that JSON into string resources, and at runtime
`FirebaseInitProvider` (a `ContentProvider` shipped inside `firebase-common`) reads them
and initializes Firebase **before** `Application.onCreate` — which is what lets an FCM
push wake a killed app and reach `PushNotificationService`. No JS Firebase SDK and no
`@react-native-firebase/app` config plugin are involved.

> Because the copy happens during prebuild, never place `google-services.json` inside
> `android/` by hand — that directory is generated and `expo prebuild --clean` wipes it.
> The app root is the durable location.

### 9.3 Obtain `google-services.json`

The file is **gitignored** (`app/.gitignore`), so it never arrives via `git clone` and
each developer must fetch their own. In the [Firebase console](https://console.firebase.google.com/),
open the same project the server's `fcm-credentials.json` came from (see
[`server/README.md`](./server/README.md)) → _Project settings_ → _Your apps_ → add an
**Android** app if none exists → download `google-services.json` → save it at
`app/google-services.json`.

The app's `package_name` in that file must match `android.package` in `app.json`
exactly (`io.fishjam.example.voipcall`), or the Gradle plugin fails the build with
`No matching client found for package name`.

### 9.4 What goes wrong if you set only one

| `enableVoip` | `googleServicesFile` | Result                                                                  |
| ------------ | -------------------- | ----------------------------------------------------------------------- |
| `true`       | set, file present    | Works.                                                                  |
| `true`       | set, file missing    | `expo prebuild` fails: `Cannot copy google-services.json`.              |
| `true`       | absent               | Prebuild **succeeds**, Firebase is never wired up, pushes never arrive. |
| `false`      | absent               | Fine — no Firebase, no VoIP. This is the opt-out.                       |

The third row is the dangerous one: it fails silently at runtime rather than at build
time. If Android calls never ring, check this first.

### 9.5 Bare workflow (without Expo)

Config plugins only run during `expo prebuild`. In a bare React Native project the two
`app.json` fields above do **nothing**, and you own `android/` yourself — so you have to
perform by hand everything sections 9.1 and 9.2 would have generated.

First, Firebase, per the [Firebase Android setup guide](https://firebase.google.com/docs/android/setup).
The [`google-services` Gradle plugin](https://developers.google.com/android/guides/google-services-plugin)
must be applied to the **application** module — a library cannot apply it on your behalf,
because it reads your `applicationId` to select the matching client from the JSON and
writes string resources into your app's `res/`:

```groovy
// android/build.gradle
buildscript {
    dependencies {
        classpath 'com.google.gms:google-services:4.4.1'
    }
}
```

```groovy
// android/app/build.gradle
apply plugin: 'com.google.gms.google-services'
```

Then place `google-services.json` at `android/app/google-services.json` (in a bare
project this _is_ the durable location — nothing regenerates the directory).

Second, the manifest entries. Add to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.MANAGE_OWN_CALLS"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT"/>
<uses-permission android:name="android.permission.VIBRATE"/>

<application>
  <activity
      android:name="com.oney.WebRTCModule.voip.IncomingCallActivity"
      android:exported="false"
      android:showWhenLocked="true"
      android:turnScreenOn="true"
      android:launchMode="singleInstance"
      android:excludeFromRecents="true"
      android:taskAffinity=""
      android:theme="@android:style/Theme.Black.NoTitleBar.Fullscreen"/>

  <receiver
      android:name="com.oney.WebRTCModule.voip.EndCallNotificationReceiver"
      android:exported="false"/>

  <service
      android:name="com.oney.WebRTCModule.voip.PushNotificationService"
      android:exported="false">
    <intent-filter android:priority="1">
      <action android:name="com.google.firebase.MESSAGING_EVENT"/>
    </intent-filter>
  </service>

  <meta-data
      android:name="firebase_messaging_installation_id_enabled"
      android:value="true"/>

  <!-- Optional; native defaults are 45, 60, and 10 seconds respectively. -->
  <meta-data
      android:name="FishjamVoipIncomingCallTimeout"
      android:value="45"/>
  <meta-data
      android:name="FishjamVoipOutgoingCallTimeout"
      android:value="60"/>
  <meta-data
      android:name="FishjamVoipFulfillAnswerTimeout"
      android:value="10"/>

  <!-- CallStyle notification (status-bar) icon. Defaults to the app icon; override
       via the plugin's `voip.notificationIcon` (a drawable/mipmap resource). -->
  <meta-data
      android:name="VoipNotificationIcon"
      android:resource="@mipmap/ic_launcher"/>
</application>
```

`packages/mobile-client/plugin/src/withFishjamVoipAndroid.ts` is the source of truth for these
entries — if the plugin gains one, mirror it here.

Note that `firebase-messaging` arrives automatically as a transitive dependency of
`@fishjam-cloud/react-native-webrtc`, so you never declare it yourself. Omitting the
Gradle plugin above does not remove Firebase from your build; it only leaves it
unconfigured, which is the silent failure from the table in 9.4.

To opt **out** of VoIP in a bare project, simply omit all of the above — the manifest
entries are what activate the feature.

### 9.6 Coexisting with other push-notification libraries

Android delivers every FCM message to **one** service per app — the single
`com.google.firebase.MESSAGING_EVENT` match that wins the manifest merge
([FirebaseMessagingService](https://firebase.google.com/docs/reference/android/com/google/firebase/messaging/FirebaseMessagingService)).
Since `PushNotificationService` claims that slot, an app that also uses
expo-notifications or [`@react-native-firebase/messaging`](https://rnfirebase.io/messaging/usage)
would normally lose one side. The SDK solves this with **native relaying**:

- `PushNotificationService` consumes only VoIP pushes — data messages carrying the
  discriminator `"fishjam": "voip-incoming"`. The key is vendor-namespaced so no other
  push SDK's payload can collide with it, and the value is a message _type_ so future
  kinds (e.g. a cancel push) fit the same key. Servers must include it alongside the
  call fields (`roomName`, `displayName`, `isVideo`, …) — a message without it is
  never treated as a call.
- Every other message — and every new-token callback — is handed to the app's other
  messaging service, named by a `VoipFallbackMessagingService` `<meta-data>` entry.
  The fallback is instantiated natively and runs its real code, so its killed-state
  behavior is preserved (this is why the chain is native, not JS: a killed app receives
  the FCM wake-up before any JS runs, and the CallStyle notification must post within
  Telecom's window).

**Expo (one plugin option).** Name your other push library in the plugin config:

```json
[
  "@fishjam-cloud/react-native-client",
  {
    "android": {
      "enableVoip": true,
      "voipFallbackMessagingService": "expo-notifications"
    }
  }
]
```

Accepted values: `"expo-notifications"`, `"@react-native-firebase/messaging"`, or a
fully-qualified `FirebaseMessagingService` class name. For the known libraries the
plugin writes the meta-data entry and strips the library's own service declaration with
[`tools:node="remove"`](https://developer.android.com/build/manage-manifests#node_markers)
(two registered services would make FCM delivery order undefined). Omit the option if
you use no other push library — without it, nothing is relayed.

**Bare RN.** Add the meta-data yourself, and make sure the other library's service is
not also registered (libraries that declare it in their library manifest need a
`tools:node="remove"` entry in your app manifest):

```xml
<meta-data
    android:name="VoipFallbackMessagingService"
    android:value="io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService"/>

<service
    android:name="io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService"
    tools:node="remove"/>
```

**Advanced: your own dispatcher.** Apps juggling several push SDKs (or needing payload
interception) can own the service themselves and call the SDK's public helpers first —
the same pattern Twilio, Sendbird and Stream document. Set
`android.voipMessagingService: false` in the plugin (or don't declare our service in
bare RN), register your service instead, and:

```kotlin
class MyMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        if (PushNotificationService.handleVoipMessage(this, message)) return
        // Not a call push — route it to anything you like.
        MyChatSdk.handle(message)
    }

    override fun onNewToken(token: String) {
        PushNotificationService.handleNewToken(token)
        MyChatSdk.onNewToken(token)
    }
}
```

Notes:

- OneSignal needs none of this — it intercepts pushes below the service layer
  (a priority-999 broadcast receiver) and coexists with our service by construction.
- FCM **notification** messages (payloads with a `notification` block) sent while the
  app is backgrounded never reach any service — Android's system tray shows them
  directly ([message types](https://firebase.google.com/docs/cloud-messaging/concept-options#notifications_and_data_messages)).
  Only **data** messages route through the relay.
- iOS is unaffected: VoIP pushes ride PushKit's separate channel.

### 9.7 Testing

1. Run on a **real device or emulator with Google Play services** (FCM needs them).
2. Confirm the FCM token is logged on startup — that is the push destination the
   server sends to (`sendFcmPush` in `server/main.ts`).
3. Kill the app, then trigger a call. The full-screen incoming-call UI should appear
   over the lock screen.
