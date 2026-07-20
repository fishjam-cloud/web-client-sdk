# @fishjam-cloud/expo-voip

iOS AppDelegate glue for [Fishjam](https://fishjam.io) VoIP. Install it alongside
`@fishjam-cloud/react-native-client` when you enable VoIP options in the Fishjam config plugin.

It contains no JavaScript and no VoIP logic of its own — just an
[`ExpoAppDelegateSubscriber`](https://docs.expo.dev/modules/appdelegate-subscribers/) that forwards
two AppDelegate events into the Fishjam SDK:

- `didFinishLaunchingWithOptions` → starts the PushKit registry at launch, so VoIP pushes delivered
  before the JS bundle loads (cold start) can still report an incoming call
- `application(_:continue:restorationHandler:)` → routes Siri and Phone-app Recents call intents
  (`INStartCallIntent`) into the SDK

## Installation

```sh
npx expo install @fishjam-cloud/expo-voip
```

That's it — Expo autolinking picks the module up during `pod install`. The subscriber only
activates when the `FishjamVoipEnabled` Info.plist flag is present, which the
`@fishjam-cloud/react-native-client` config plugin writes automatically when `voip` options are
set. Apps that install this package without enabling VoIP get a no-op.

## Bare React Native (no Expo Modules)

If your app does not use `ExpoAppDelegate`, wire the two calls manually in your `AppDelegate`:

```swift
// in application(_:didFinishLaunchingWithOptions:)
VoipManager.registerForVoIPPushes()

// in application(_:continue:restorationHandler:)
if VoipManager.handleContinueUserActivity(userActivity) {
  return true
}
```

Android needs no equivalent — everything is handled declaratively via the manifest by the config
plugin.
