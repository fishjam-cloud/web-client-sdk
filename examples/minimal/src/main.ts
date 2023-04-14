import { JellyfishClient } from "@jellyfish-dev/ts-client-sdk";

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
  token: peerToken,
  // if websocketUrl is not provided, it will default to ws://localhost:4000/socket/websocket
});

// You can listen to events emitted by the client
client.on("onJoinSuccess", (peerId, peersInRoom) => {
  console.log("join success");
  console.log("peerId", peerId);
  console.log("peersInRoom", peersInRoom);

  // To start broadcasting your media you will need source of MediaStream like camera, microphone or screen
  // In this example we will use screen sharing
  startScreenSharing();
});

// To receive media from other peers you need to listen to onTrackReady event
client.on("onTrackReady", (ctx) => {
  console.log("On track ready");
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
  console.log("On track removed");
  const peerId = ctx.peer.id;
  document.getElementById(peerId)?.remove(); // remove video element
});

async function startScreenSharing() {
  // Get screen sharing MediaStream
  const screenStream = await navigator.mediaDevices.getDisplayMedia(SCREEN_SHARING_MEDIA_CONSTRAINTS);

  // Add local MediaStream to the client
  screenStream.getTracks().forEach((track) => client.addTrack(track, screenStream, { type: "screen" }));
}
