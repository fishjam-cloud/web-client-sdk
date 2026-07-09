# @fishjam-cloud/react-native-client

React Native client library for Fishjam.

## Installation

```bash
npm install @fishjam-cloud/react-native-client
# or
yarn add @fishjam-cloud/react-native-client
```

## Android VoIP setup

Incoming calls on Android are delivered over Firebase Cloud Messaging, so Firebase is
only pulled into your build when you opt in. iOS uses PushKit/APNs and needs none of this.

### Expo

Enable VoIP in the config plugin and point Expo at your `google-services.json`:

```json
{
  "expo": {
    "android": { "googleServicesFile": "./google-services.json" },
    "plugins": [["@fishjam-cloud/react-native-client", { "android": { "enableVoip": true } }]]
  }
}
```

Prebuild does the rest. [`android.googleServicesFile`](https://docs.expo.dev/versions/latest/config/app/#googleservicesfile)
makes Expo add the `com.google.gms:google-services` classpath, apply the Gradle plugin, and copy
the file into `android/app/`. Omitting it while `enableVoip` is on is a prebuild error.

### Bare React Native

Config plugins do not run, and the [`google-services` Gradle plugin](https://developers.google.com/android/guides/google-services-plugin)
must be applied to the **application** module — a library cannot do it for you. Follow the
[Firebase Android setup guide](https://firebase.google.com/docs/android/setup) to add
`google-services.json` and apply the plugin.

You must also declare by hand what the config plugin would otherwise inject into
`AndroidManifest.xml` — the `MANAGE_OWN_CALLS`, `POST_NOTIFICATIONS`,
`USE_FULL_SCREEN_INTENT` and `VIBRATE` permissions, the `IncomingCallActivity`,
the `EndCallNotificationReceiver`, and the `PushNotificationService` with its
`com.google.firebase.MESSAGING_EVENT` intent filter. See `plugin/src/withFishjamVoip.ts`
for the exact entries.

## Local Development with WebRTC Fork

This package depends on `@fishjam-cloud/react-native-webrtc`, a fork of `react-native-webrtc`. The fork lives in [its own GitHub repo](https://github.com/fishjam-cloud/fishjam-react-native-webrtc) and is included in this monorepo as a git submodule at `packages/react-native-webrtc/`, wired up as a yarn workspace. No manual linking is required.

### Setup

Clone the repository with submodules:

```bash
git clone --recurse-submodules https://github.com/fishjam-cloud/web-client-sdk.git
```

If you already cloned without `--recurse-submodules`, initialize the submodules from inside the repo:

```bash
git submodule update --init --recursive
```

Then install dependencies from the repo root:

```bash
yarn install
```

Yarn resolves `@fishjam-cloud/react-native-webrtc` to the workspace at `packages/react-native-webrtc/`, and React Native autolinking picks up the native iOS and Android code automatically through the symlinked package.

### Development Workflow

| Change Type                           | What to Do                                            |
| ------------------------------------- | ----------------------------------------------------- |
| **JS/TS changes** in the fork         | Save → Metro hot reloads automatically                |
| **Native code changes** (iOS/Android) | Save → Rebuild the app (`yarn ios` or `yarn android`) |

No `pod install` or `yarn install` is needed after native code changes — just rebuild the app.

### Updating the Submodule

The submodule tracks the fork's `master` branch but is pinned to a specific commit. To update to the latest upstream:

```bash
git submodule update --remote packages/react-native-webrtc
git add packages/react-native-webrtc
git commit -m "Bump react-native-webrtc submodule"
```

To check out a specific tag or commit:

```bash
git -C packages/react-native-webrtc fetch
git -C packages/react-native-webrtc checkout <tag-or-sha>
git add packages/react-native-webrtc
git commit -m "Pin react-native-webrtc to <tag-or-sha>"
```

When bumping the submodule across a version boundary, also update `peerDependencies.@fishjam-cloud/react-native-webrtc` in this package's `package.json` so external consumers see the correct range.

### Contributing Changes to the Fork

Changes inside `packages/react-native-webrtc/` belong to the fork's own repo, not this one. To push them upstream:

```bash
cd packages/react-native-webrtc
git checkout -b your-feature-branch
# commit your changes
git push origin your-feature-branch
# open a PR against fishjam-cloud/fishjam-react-native-webrtc
```

Once the upstream PR is merged, bump the submodule sha here (see "Updating the Submodule" above).
