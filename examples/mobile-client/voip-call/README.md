# iOS VoIP Push Notifications — setup

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
