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

In Xcode → Signing & Capabilities this corresponds to **Background Modes →
Voice over IP** and **Push Notifications**.

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
import { useCallKitEvent } from "./src/callkit";

useCallKitEvent("registered", (token) => console.log("VoIP token:", token));
useCallKitEvent("incoming", (payload) =>
  console.log("incoming push:", payload),
);
useCallKitEvent("answer", (payload) => console.log("answer:", payload));
useCallKitEvent("ended", (payload) => console.log("ended:", payload));
```

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
      }
    }
  ]
]
```

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
[`server/README.md`](./server/README.md)) → *Project settings* → *Your apps* → add an
**Android** app if none exists → download `google-services.json` → save it at
`app/google-services.json`.

The app's `package_name` in that file must match `android.package` in `app.json`
exactly (`io.fishjam.example.voipcall`), or the Gradle plugin fails the build with
`No matching client found for package name`.

### 9.4 What goes wrong if you set only one

| `enableVoip` | `googleServicesFile` | Result |
| --- | --- | --- |
| `true` | set, file present | Works. |
| `true` | set, file missing | `expo prebuild` fails: `Cannot copy google-services.json`. |
| `true` | absent | Prebuild **succeeds**, Firebase is never wired up, pushes never arrive. |
| `false` | absent | Fine — no Firebase, no VoIP. This is the opt-out. |

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
project this *is* the durable location — nothing regenerates the directory).

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
    <intent-filter>
      <action android:name="com.google.firebase.MESSAGING_EVENT"/>
    </intent-filter>
  </service>

  <meta-data
      android:name="firebase_messaging_installation_id_enabled"
      android:value="true"/>
</application>
```

`packages/mobile-client/plugin/src/withFishjamVoip.ts` is the source of truth for these
entries — if the plugin gains one, mirror it here.

Note that `firebase-messaging` arrives automatically as a transitive dependency of
`@fishjam-cloud/react-native-webrtc`, so you never declare it yourself. Omitting the
Gradle plugin above does not remove Firebase from your build; it only leaves it
unconfigured, which is the silent failure from the table in 9.4.

To opt **out** of VoIP in a bare project, simply omit all of the above — the manifest
entries are what activate the feature.

### 9.6 Testing

1. Run on a **real device or emulator with Google Play services** (FCM needs them).
2. Confirm the FCM token is logged on startup — that is the push destination the
   server sends to (`sendFcmPush` in `server/main.ts`).
3. Kill the app, then trigger a call. The full-screen incoming-call UI should appear
   over the lock screen.
