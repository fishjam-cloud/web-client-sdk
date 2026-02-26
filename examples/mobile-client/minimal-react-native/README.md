# Video Room Example

A fully functional video room demo built with [Fishjam Cloud](https://fishjam.io/), [Expo](https://expo.dev/), and [React Native](https://reactnative.dev/). This project demonstrates how to quickly integrate real-time video communication into your mobile app using the Fishjam Cloud React Native SDK.

## Features

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
   - Create a `.env` file in the `examples/mobile-client/minimal-react-native` directory:
     ```sh
     cp .env.example .env
     ```
   - Fill in your Fishjam ID. _You can obtain it at [https://fishjam.io/app/](https://fishjam.io/app/)._
4. **Prebuild native files:**
   ```sh
   cd examples/mobile-client/minimal-react-native
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
4. Leaving the room or closing the app will disconnect you from the session.

## Architecture Overview

- **React Native + Expo**: Cross-platform mobile app framework.
- **Fishjam Cloud SDK**: Handles all real-time video, audio, and peer management.
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
