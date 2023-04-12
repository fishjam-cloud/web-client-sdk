# Jellyfish TS client

TypeScript client library for [Jellyfish](https://github.com/jellyfish-dev/jellyfish).

## Usage

Prerequisites:

- Running [Jellyfish](https://github.com/jellyfish-dev/jellyfish) server.
- Created room and token of peer in that room.
  You u can use [dashboard](https://github.com/jellyfish-dev/jellyfish-react-client/tree/main/examples/dashboard) example to create room and peer token.

This snippet is based on [minimal](https://github.com/jellyfish-dev/jellyfish-react-client/tree/main/examples/minimal) example.

```ts
import { JellyfishClient } from "@jellyfish-dev/jellyfish-react-client/jellyfish";
import { SCREEN_SHARING_MEDIA_CONSTRAINTS } from "@jellyfish-dev/jellyfish-react-client/navigator";

const client = new JellyfishClient(); // if url is not provided, it will default to ws://localhost:4000/socket/websocket

const peerToken = "YOUR_PEER_TOKEN";

// Start the peer connection
client.connect({
  peerMetadata: { name: "peer" },
  isSimulcastOn: false,
  token: peerToken,
});

// You can listen to events emitted by the client
client.on("onJoinSuccess", (peerId, peersInRoom) => {
  console.log("join success");

  // To start broadcasting your media you will need source of MediaStream like camera, microphone or screen
  // In this example we will use screen sharing
  startScreenSharing();
});

async function startScreenSharing() {
  const { webrtc } = client;
  // Check if webrtc is initialized
  if (!webrtc) return console.error("webrtc is not initialized");

  // Create a new MediaStream to add tracks to
  const localStream: MediaStream = new MediaStream();

  // Get screen sharing MediaStream
  const screenStream = await navigator.mediaDevices.getDisplayMedia(SCREEN_SHARING_MEDIA_CONSTRAINTS);

  // Add tracks from screen sharing MediaStream to local MediaStream
  screenStream.getTracks().forEach((track) => localStream.addTrack(track));

  // Add local MediaStream to webrtc
  localStream.getTracks().forEach((track) => webrtc.addTrack(track, localStream, { type: "screen" }));
}
```

For more examples, see [examples](https://github.com/jellyfish-dev/jellyfish-react-client/tree/main/examples) folder.

More information about usage of webrtc can be found in [MembraneWebRTC documentation](https://jellyfish-dev.github.io/membrane-webrtc-js/).
