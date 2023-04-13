# Jellyfish TS client

TypeScript client library for [Jellyfish](https://github.com/jellyfish-dev/jellyfish).

## Usage

Prerequisites:

- Running [Jellyfish](https://github.com/jellyfish-dev/jellyfish) server.
- Created room and token of peer in that room.
  You u can use [dashboard](https://github.com/jellyfish-dev/jellyfish-react-client/tree/main/examples/dashboard) example to create room and peer token.

This snippet is based on [minimal](https://github.com/jellyfish-dev/ts-client-sdk/tree/main/examples/minimal) example.

```ts
import { JellyfishClient } from "@jellyfish-dev/ts-client-sdk";
import { MembraneWebRTC } from "@jellyfish-dev/membrane-webrtc-js";

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

// Creates a new JellyfishClient object to interact with Jellyfish
const client = new JellyfishClient<PeerMetadata, TrackMetadata>();

const peerToken = prompt("Enter peer token") ?? "YOUR_PEER_TOKEN";

// Start the peer connection
client.connect({
  peerMetadata: { name: "peer" },
  isSimulcastOn: false,
  token: peerToken,
  // if websocketUrl is not provided, it will default to ws://localhost:4000/socket/websocket
});

// You can listen to events emitted by the client
client.on("onJoinSuccess", (peerId, peersInRoom) => {
  // Check if webrtc is initialized
  if (!client.webrtc) return console.error("webrtc is not initialized");

  // To start broadcasting your media you will need source of MediaStream like camera, microphone or screen
  // In this example we will use screen sharing
  startScreenSharing(client.webrtc);
});

// To receive media from other peers you need to listen to onTrackReady event
client.on("onTrackReady", (ctx) => {
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
client.on("onTrackRemoved", (ctx) => {
  const peerId = ctx.peer.id;
  document.getElementById(peerId)?.remove(); // remove video element
});

async function startScreenSharing(webrtc: MembraneWebRTC) {
  // Get screen sharing MediaStream
  const screenStream = await navigator.mediaDevices.getDisplayMedia(SCREEN_SHARING_MEDIA_CONSTRAINTS);

  // Add local MediaStream to webrtc
  screenStream.getTracks().forEach((track) => webrtc.addTrack(track, screenStream, { type: "screen" }));
}
```

For more examples, see [examples](https://github.com/jellyfish-dev/ts-client-sdk/tree/main/examples) folder.

More information about usage of webrtc can be found in [MembraneWebRTC documentation](https://jellyfish-dev.github.io/membrane-webrtc-js/).
