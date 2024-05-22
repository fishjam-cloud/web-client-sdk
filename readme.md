# Fishjam TS client

TypeScript client library for [Fishjam](https://github.com/fishjam-dev/fishjam).

## Documentation

Documentation is available [here](https://fishjam-dev.github.io/ts-client-sdk/)

## Installation

You can install this package using `npm`:

```bash
npm install @fishjam-dev/ts-client
```

It was tested with `node.js` version specified in `.tool-versions` file.

## Usage

Prerequisites:

- Running [Fishjam](https://github.com/fishjam-dev/fishjam) server.
- Created room and token of peer in that room.
  You u can use [dashboard](https://github.com/fishjam-dev/fishjam-dashboard) example to create room and peer token.

This snippet is based on [minimal](https://github.com/fishjam-dev/ts-client-sdk/tree/main/examples/minimal) example.

```ts
import { FishjamClient, WebRTCEndpoint } from "@fishjam-dev/ts-client";

const SCREEN_SHARING_MEDIA_CONSTRAINTS = {
  video: {
    frameRate: { ideal: 20, max: 25 },
    width: { max: 1920, ideal: 1920 },
    height: { max: 1080, ideal: 1080 },
  },
};

// Example metadata types for peer and track
// You can define your own metadata types just make sure they are serializable
type PeerMetadata = {
  name: string;
};

type TrackMetadata = {
  type: "camera" | "screen";
};

// Creates a new FishjamClient object to interact with Fishjam
const client = new FishjamClient<PeerMetadata, TrackMetadata>();

const peerToken = prompt("Enter peer token") ?? "YOUR_PEER_TOKEN";

// Start the peer connection
client.connect({
  peerMetadata: { name: "peer" },
  token: peerToken,
  // if websocketUrl is not provided, it will default to ws://localhost:5002/socket/peer/websocket
});

// You can listen to events emitted by the client
client.on("joined", (peerId, peersInRoom) => {
  // Check if webrtc is initialized
  if (!client.webrtc) return console.error("webrtc is not initialized");

  // To start broadcasting your media you will need source of MediaStream like camera, microphone or screen
  // In this example we will use screen sharing
  startScreenSharing(client.webrtc);
});

// To receive media from other peers you need to listen to onTrackReady event
client.on("trackReady", (ctx) => {
  const peerId = ctx.peer.id;

  document.getElementById(peerId)?.remove(); // remove previous video element if it exists

  // Create a new video element to display the media
  const videoPlayer = document.createElement("video");
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
client.on("trackRemoved", (ctx) => {
  const peerId = ctx.peer.id;
  document.getElementById(peerId)?.remove(); // remove video element
});

async function startScreenSharing(webrtc: WebRTCEndpoint) {
  // Get screen sharing MediaStream
  const screenStream = await navigator.mediaDevices.getDisplayMedia(SCREEN_SHARING_MEDIA_CONSTRAINTS);

  // Add local MediaStream to webrtc
  screenStream.getTracks().forEach((track) => webrtc.addTrack(track, screenStream, { type: "screen" }));
}
```

## Examples

For more examples, see [examples](https://github.com/fishjam-dev/ts-client-sdk/tree/main/examples) folder.

## Contributing

We welcome contributions to Fishjam Ts Client SDK. Please report any bugs or issues you find or feel free to make a pull request with your own bug fixes and/or features.

Detailed information about contributing can be found in [contributing.md](./contributing.md).

## Fishjam Ecosystem

|             |                                                                                                                                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client SDKs | [React](https://github.com/fishjam-dev/react-client-sdk), [React Native](https://github.com/fishjam-dev/react-native-client-sdk), [iOs](https://github.com/fishjam-dev/ios-client-sdk), [Android](https://github.com/fishjam-dev/android-client-sdk) |
| Server SDKs | [Elixir](https://github.com/fishjam-dev/elixir_server_sdk), [Python](https://github.com/fishjam-dev/python-server-sdk), [OpenAPI](https://fishjam-dev.github.io/fishjam-docs/api_reference/rest_api)                                                 |
| Services    | [Videoroom](https://github.com/fishjam-dev/fishjam-videoroom) - an example videoconferencing app written in elixir <br/> [Dashboard](https://github.com/fishjam-dev/fishjam-dashboard) - an internal tool used to showcase Fishjam's capabilities    |
| Resources   | [Fishjam Book](https://fishjam-dev.github.io/book/) - theory of the framework, [Docs](https://fishjam-dev.github.io/fishjam-docs/), [Tutorials](https://github.com/fishjam-dev/fishjam-clients-tutorials)                                            |
| Membrane    | Fishjam is based on [Membrane](https://membrane.stream/), [Discord](https://discord.gg/nwnfVSY)                                                                                                                                                      |
| Compositor  | [Compositor](https://github.com/membraneframework/membrane_video_compositor_plugin) - Membrane plugin to transform video                                                                                                                             |
| Protobufs   | If you want to use Fishjam on your own, you can use our [protobufs](https://github.com/fishjam-dev/protos)                                                                                                                                           |

## Copyright and License

Copyright 2023, [Software Mansion](https://swmansion.com/?utm_source=git&utm_medium=readme&utm_campaign=fishjam)

[![Software Mansion](https://logo.swmansion.com/logo?color=white&variant=desktop&width=200&tag=membrane-github)](https://swmansion.com/?utm_source=git&utm_medium=readme&utm_campaign=fishjam)

Licensed under the [Apache License, Version 2.0](LICENSE)
