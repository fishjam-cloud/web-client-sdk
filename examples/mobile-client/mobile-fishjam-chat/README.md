# React Native Fishjam example

## Prerequisites

Create a `.env` file in the `examples/mobile-client/mobile-fishjam-chat` directory (optional), or copy the `.env.example` file. The following environment variables are required:

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

```cmd
yarn
yarn build
```

3. Prebuild native files in example directory:

```cmd
cd examples/mobile-client/mobile-fishjam-chat
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

1. Whenever you make changes in the `packages` directory, make sure to build the app in the root directory (not in `examples/mobile-client/mobile-fishjam-chat`). This ensures that all related workspaces are also built:
```cmd
yarn build
```
2. Linter (run in the root directory):
```cmd
yarn lint
```
