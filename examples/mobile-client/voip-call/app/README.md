# voip-call-app

The Expo React Native client of the VoIP call example. Setup and run
instructions (push credentials, `google-services.json`, `.env`) are in the
[example README](../README.md) one level up; how the integration works is in
the [VoIP calls guide](https://documentation.fishjam.io/docs/how-to/client/voip-calls).

## Run

With the [server](../server/README.md) running and `.env` filled in:

```bash
yarn ios       # or: yarn android
```

Real devices only: VoIP pushes never reach the iOS Simulator, and FCM needs
Google Play services.

## iOS native registration

On Expo, the app depends on
[`@fishjam-cloud/ios-expo-voip`](https://www.npmjs.com/package/@fishjam-cloud/ios-expo-voip),
which registers the native subscriptions the SDK needs at launch: PushKit and
the Recents redial intent forwarding. Without the PushKit registration the app
never receives `didReceiveIncomingPush`, so VoIP pushes don't work at all, and
tap-to-redial silently does nothing.
