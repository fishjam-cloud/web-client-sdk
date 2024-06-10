[![NPM Version](https://img.shields.io/npm/v/@fishjam-dev/ts-client)](https://www.npmjs.com/package/@fishjam-dev/ts-client)
[![TypeScript Strict](https://badgen.net/badge/TS/Strict)](https://www.typescriptlang.org)
[![TypeDoc](https://img.shields.io/badge/TypeDoc-8A2BE2)](https://fishjam-dev.github.io/ts-client-sdk/)

# Fishjam TS Client

TypeScript client library for [Fishjam](https://github.com/fishjam-dev/fishjam).

## Installation

You can install this package using `npm`:

```bash
npm install @fishjam-dev/ts-client
```

## Documentation

Documentation is available [here](https://fishjam-dev.github.io/ts-client-sdk/).

For a more comprehensive tutorial on Fishjam, its capabilities and usage in
production, refer to the
[Fishjam docs](https://fishjam-dev.github.io/fishjam-docs/).

## Usage

Prerequisites:

- A running [Fishjam](https://github.com/fishjam-dev/fishjam) server.
- A created room and a peer's token in that room. You can use the
  [dashboard](https://github.com/fishjam-dev/fishjam-dashboard) example to
  create a room and a peer token.

The following code snippet is based on the [minimal](./examples/minimal)
example.

```ts
import { FishjamClient, WebRTCEndpoint } from '@fishjam-dev/ts-client';

const SCREEN_SHARING_MEDIA_CONSTRAINTS = {
  video: {
    frameRate: { ideal: 20, max: 25 },
    width: { max: 1920, ideal: 1920 },
    height: { max: 1080, ideal: 1080 },
  },
};

// Example metadata types for peer and track
// You can define your own metadata types, just make sure they are serializable
type PeerMetadata = {
  name: string;
};

type TrackMetadata = {
  type: 'camera' | 'screen';
};

// Create a new FishjamClient object to interact with Fishjam
const client = new FishjamClient<PeerMetadata, TrackMetadata>();

const peerToken = prompt('Enter peer token') ?? 'YOUR_PEER_TOKEN';

// Start the peer connection
client.connect({
  peerMetadata: { name: 'peer' },
  token: peerToken,
  // if the 'signaling' field is missing, the client will connect to ws://localhost:5002/socket/peer/websocket
});

// You can listen to events emitted by the client
client.on('joined', (peerId, peersInRoom) => {
  // Check if webrtc is initialized
  if (!client.webrtc) return console.error('webrtc is not initialized');

  // To start broadcasting your media, you will need a source of MediaStream like a camera, microphone, or screen
  // In this example, we will use screen sharing
  startScreenSharing(client.webrtc);
});

// To receive media from other peers, you need to listen to the onTrackReady event
client.on('trackReady', (ctx) => {
  const peerId = ctx.peer.id;

  document.getElementById(peerId)?.remove(); // remove previous video element if it exists

  // Create a new video element to display the media
  const videoPlayer = document.createElement('video');
  videoPlayer.id = peerId;
  videoPlayer.oncanplaythrough = function () {
    // Chrome blocks autoplay of unmuted video
    videoPlayer.muted = true;
    videoPlayer.play();
  };
  document.body.appendChild(videoPlayer);

  videoPlayer.srcObject = ctx.stream; // assign MediaStream to video element
});

// Cleanup video element when track is removed
client.on('trackRemoved', (ctx) => {
  const peerId = ctx.peer.id;
  document.getElementById(peerId)?.remove(); // remove video element
});

async function startScreenSharing(webrtc: WebRTCEndpoint) {
  // Get screen sharing MediaStream
  const screenStream = await navigator.mediaDevices.getDisplayMedia(
    SCREEN_SHARING_MEDIA_CONSTRAINTS,
  );

  // Add local MediaStream to webrtc
  screenStream
    .getTracks()
    .forEach((track) => webrtc.addTrack(track, { type: 'screen' }));
}
```

## Examples

For more examples, see the [examples](./examples) folder.

## Contributing

We welcome contributions to the Fishjam TS Client. Please report any bugs or
issues that you find, or feel free to make a pull request with your own bug
fixes and/or features.

More detailed information about contributing can be found in
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Fishjam Ecosystem

|                |                                                                                                                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 📱 Client SDKs | [TypeScript](https://github.com/fishjam-dev/ts-client-sdk/) <br/> [React](https://github.com/fishjam-dev/react-client-sdk) <br/> [iOS](https://github.com/fishjam-dev/ios-client-sdk) <br/> [Android](https://github.com/fishjam-dev/android-client-sdk) <br/> [React Native](https://github.com/fishjam-dev/react-native-client-sdk) |
| ⚙️ Server SDKs | [JavaScript](https://github.com/fishjam-dev/js-server-sdk) <br/> [Python](https://github.com/fishjam-dev/python-server-sdk) <br/> [Elixir](https://github.com/fishjam-dev/elixir_server_sdk)                                                                                                                                          |
| 📚 Resources   | [Fishjam Docs](https://fishjam-dev.github.io/fishjam-docs/) <br/> [Membrane Framework](https://membrane.stream/) <br/> [Join Membrane Discord!](https://discord.gg/nwnfVSY)                                                                                                                                                           |
| 🫙 Services    | [Videoroom](https://github.com/fishjam-dev/fishjam-videoroom) <br/> A videoconferencing app built on top of Fishjam <br/><br/> [Dashboard](https://github.com/fishjam-dev/fishjam-dashboard) <br/> An all-around development tool for Fishjam                                                                                         |

## Copyright and License

Copyright 2024,
[Software Mansion](https://swmansion.com/?utm_source=git&utm_medium=readme&utm_campaign=fishjam)

[![Software Mansion](https://logo.swmansion.com/logo?color=white&variant=desktop&width=200&tag=membrane-github)](https://swmansion.com/?utm_source=git&utm_medium=readme&utm_campaign=fishjam)

Licensed under the [Apache License, Version 2.0](LICENSE)
