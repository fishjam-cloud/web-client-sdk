# @fishjam-cloud/react-native-client

React Native client library for Fishjam.

## Installation

```bash
npm install @fishjam-cloud/react-native-client
# or
yarn add @fishjam-cloud/react-native-client
```

## Local Development with WebRTC Fork

This package depends on `@fishjam-cloud/react-native-webrtc`, which is a fork of `react-native-webrtc`. When developing features that require changes to the native WebRTC code, you can set up a local development environment for faster iteration.

### Prerequisites

1. Clone the WebRTC fork:

   ```bash
   git clone https://github.com/fishjam-cloud/fishjam-react-native-webrtc.git
   ```

### Setting Up Local Development

1. **Update the dependency in `packages/mobile-client/package.json`:**

   Change from:

   ```json
   "@fishjam-cloud/react-native-webrtc": "^x.x.x"
   ```

   To a local file path:

   ```json
   "@fishjam-cloud/react-native-webrtc": "file:<PATH_TO_CLONED_REPO>/react-native-webrtc"
   ```

   > **Note:** Adjust the path based on where you cloned the fork. If using a git submodule, add it at `packages/react-native-webrtc`.

2. **Run yarn install** from the repository root:

   ```bash
   yarn install
   ```

3. **Run expo prebuild** in the example app:

   ```bash
   cd examples/mobile-client/fishjam-chat
   npx expo prebuild
   ```

   The local development plugin (`examples/mobile-client/common/plugins`) will automatically detect the `file:` dependency and configure:

   - **iOS Podfile:** Adds `pod 'FishjamReactNativeWebrtc', :path => '...'`
   - **Android settings.gradle:** Includes local project reference

### Development Workflow

Once set up, you get a fast development cycle:

| Change Type                           | What to Do                                            |
| ------------------------------------- | ----------------------------------------------------- |
| **JS/TS changes** in the fork         | Save → Metro hot reloads automatically                |
| **Native code changes** (iOS/Android) | Save → Rebuild the app (`yarn ios` or `yarn android`) |

**No need to run `pod install` or `yarn install`** after native code changes—just rebuild!
