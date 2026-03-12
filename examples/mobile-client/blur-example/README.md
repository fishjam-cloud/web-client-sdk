# Background Blur Example

A mobile video chat demo showcasing **real-time camera background blur** using the [`@fishjam-cloud/react-native-webrtc-background-blur`](https://www.npmjs.com/package/@fishjam-cloud/react-native-webrtc-background-blur) package. Built with [Fishjam Cloud](https://fishjam.io/), [Expo](https://expo.dev/), and [React Native](https://reactnative.dev/).

## Features

- **Background blur toggle** — blur your camera background on/off during a video call using a camera track middleware
- Join a video room with a custom room name and user name
- Real-time video grid with local and remote participants
- Automatic camera and microphone permission handling

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- [Yarn](https://yarnpkg.com/) or [npm](https://www.npmjs.com/)
- [Expo](https://docs.expo.dev/get-started/installation/): You do **not** need to install Expo CLI globally. Use `npx expo` to run Expo commands.

### Installation

1. **Clone the repository:**
   ```sh
   git clone https://github.com/fishjam-cloud/web-client-sdk.git
   cd web-client-sdk
   ```
2. **Install dependencies and build project:**
   ```sh
   yarn
   yarn build
   ```
3. **Set up environment variables:**
   - Create a `.env` file in the `examples/mobile-client/blur-example` directory:
     ```sh
     cp .env.example .env
     ```
   - Fill in your Fishjam ID. _You can find the value for this variable by creating an account on [fishjam.io](https://fishjam.io) and copying it from the sandbox dashboard._

   There also exists this additional environment variable, which is used for internal testing purposes:

   - `EXPO_PUBLIC_FISHJAM_URL` - Sandbox URL for custom Fishjam environment
4. **Prebuild native files:**
   ```sh
   cd examples/mobile-client/blur-example
   npx expo prebuild --clean
   ```
   > [!NOTE]
   > Be sure to run `npx expo prebuild` and not `yarn prebuild` as there's an issue with path generation for the `ios/.xcode.env.local` file

### Running the App

- **Run on Android:**
  ```sh
  yarn android
  ```
- **Run on iOS:**
  ```sh
  yarn ios
  ```

## Usage

1. Enter a room name and your user name on the Home screen.
2. Tap **Connect** to join the video room.
3. See yourself and other participants in a responsive video grid.
4. Tap **Enable Blur** to apply background blur to your camera feed, or **Disable Blur** to turn it off.
5. Leaving the room or closing the app will disconnect you from the session.

## Architecture Overview

- **React Native + Expo**: Cross-platform mobile app framework.
- **Fishjam Cloud SDK**: Handles all real-time video, audio, and peer management.
- **`@fishjam-cloud/react-native-webrtc-background-blur`**: Provides a `useBackgroundBlur` hook that returns a camera track middleware. The middleware is applied via `setCameraTrackMiddleware` from the Fishjam `useCamera()` hook.
- **TypeScript**: Provides type safety and better developer experience.

## Troubleshooting & FAQ

- **App fails to connect to a room:**
  - Ensure your `.env` file is present and `EXPO_PUBLIC_FISHJAM_ID` is set correctly.
  - Check your network connection.
  - Review logs in the Metro/Expo console for errors.
- **Camera or microphone not working:**
  - Make sure you have granted the necessary permissions on your device.

## License

This example is provided under the Apache License 2.0. See [LICENSE](../../../LICENSE) for details.

---

_This project is maintained by the Fishjam team. For questions or support, visit [fishjam.io](https://fishjam.io/) or open an issue on GitHub._
