# React Native Fishjam example

## Prerequisites

Create a `.env` file in the `examples/mobile-client/fishjam-chat` directory (optional), or copy the `.env.example` file. The following environment variables are required:

- `EXPO_PUBLIC_VIDEOROOM_STAGING_SANDBOX_URL` - Sandbox URL for VideoRoom staging environment
- `EXPO_PUBLIC_FISHJAM_ID` - Fishjam ID for production environment

## Example Overview

The app has 2 tabs showing different ways to connect to Fishjam video calls:

**VideoRoom** - Connect to VideoRoom (Fishjam's demo service, something like Google Meet) by entering a room name and username. The app automatically creates the room and generates tokens for you.

**Livestream** - Join existing livestreams or create your own livestream.

## Project setup

1. Clone the repository:

```
git clone https://github.com/fishjam-cloud/web-client-sdk.git
cd web-client-sdk
```

2. Install dependencies and build project:

```sh
yarn
yarn build
```

> [!NOTE]
> Before prebuilding, replace `com.example.fishjamchat` in `app.json` with your own app identifiers (iOS bundle ID / Android package). The following fields need to be updated:
> - **iOS bundle identifier** — `expo.ios.bundleIdentifier`
> - **Android package name** — `expo.android.package`
> - **ScreenBroadcastExtension bundle identifier** — the `bundleIdentifier` of the `expo.extra.eas.build.experimental.ios.appExtensions` entry whose `targetName` is `"ScreenBroadcastExtension"` (must end with `.ScreenBroadcastExtension`)
> - **App group entitlement** — the `com.apple.security.application-groups` entitlement of that same `expo.extra.eas.build.experimental.ios.appExtensions` entry (must start with `group.`)

3. Prebuild native files in example directory:

```sh
cd examples/mobile-client/fishjam-chat
npx expo prebuild --clean
```

> [!NOTE]
> Be sure to run `npx expo prebuild` and not `yarn prebuild` as there's an issue with path generation for the `ios/.xcode.env.local` file

4. Build app:

```
yarn ios
yarn android
```

## Development

1. Whenever you make changes in the `packages` directory, make sure to build the app in the root directory (not in `examples/mobile-client/fishjam-chat`). This ensures that all related workspaces are also built:
```sh
yarn build
```
2. Linter (run in the root directory):
```sh
yarn lint
```
