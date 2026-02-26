# Text Chat Example

A React Native mobile app demonstrating real-time text messaging using [Fishjam Cloud](https://fishjam.io/) data channels. This example shows how to implement peer-to-peer text chat functionality in a mobile application using the Fishjam Cloud React Native SDK.

## Features

- Join a room with a custom room name and user name
- Real-time text messaging between participants using WebRTC data channels
- Reliable message delivery with automatic reconnection
- Message history with sender names and timestamps

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
   - Create a `.env` file in the `examples/mobile-client/text-chat` directory:
     ```sh
     cp .env.example .env
     ```
   - Fill in your Fishjam ID. _You can obtain it at [https://fishjam.io/app/](https://fishjam.io/app/)._

4. **Prebuild native files:**
   ```sh
   cd examples/mobile-client/text-chat
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
2. Tap **Connect** to join the room and initialize the data channel.
3. Once connected, you can send and receive text messages in real-time.
4. Messages from other participants will appear automatically.
5. Tap **Leave** to disconnect from the room.

## What This Demo Shows

This example demonstrates how to use Fishjam Cloud's data channel functionality for real-time text messaging:

- **Data Channel Initialization**: Shows how to initialize a reliable data channel after connecting to a Fishjam room
- **Message Publishing**: Demonstrates encoding and sending JSON messages via the data channel using `publishData`
- **Message Subscription**: Shows how to subscribe to incoming messages and decode them using `subscribeData`
- **Peer-to-Peer Communication**: All messages are sent directly between peers using WebRTC data channels, without going through a server
- **Reliable Delivery**: Uses reliable data channels to ensure messages are delivered in order

## Architecture Overview

- **React Native + Expo**: Cross-platform mobile app framework
- **Fishjam Cloud SDK**: Handles WebRTC peer connections and data channel management
- **Data Channels**: WebRTC data channels for peer-to-peer text messaging
- **TypeScript**: Provides type safety and better developer experience

## Troubleshooting & FAQ

- **App fails to connect to a room:**
  - Ensure your `.env` file is present and `EXPO_PUBLIC_FISHJAM_ID` is set correctly
  - Check your network connection
  - Review logs in the Metro/Expo console for errors

- **Messages not appearing:**
  - Make sure multiple participants have joined the same room
  - Check that the data channel has initialized successfully (watch for "Opening data channel..." status)
  - Verify both devices are connected to the internet

- **Data channel errors:**
  - Ensure you're using a recent version of the Fishjam SDK
  - Check that both peers support data channels (most modern devices do)
  - Review error messages in the app's status display

## Development

1. Whenever you make changes in the `packages` directory, make sure to build the app in the root directory (not in `examples/mobile-client/text-chat`). This ensures that all related workspaces are also built:

   ```sh
   yarn build
   ```

2. Linter (run in the root directory):
   ```sh
   yarn lint
   ```

## License

This example is provided under the Apache License 2.0. See [LICENSE](../../../LICENSE) for details.

---

_This project is maintained by the Fishjam team. For questions or support, visit [fishjam.io](https://fishjam.io/) or open an issue on GitHub._
