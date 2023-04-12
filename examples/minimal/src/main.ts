import { JellyfishClient } from "@jellyfish-dev/jellyfish-react-client/jellyfish";
import { SCREEN_SHARING_MEDIA_CONSTRAINTS } from "@jellyfish-dev/jellyfish-react-client/navigator";

// Example metadata types for peer and track
// You can define your own metadata types just make sure they are serializable
type PeerMetadata = {
  name: string;
};

type TrackMetadata = {
  type: "camera" | "screen";
};

// Creates a new JellyfishClient object to interact with Jellyfish
const client = new JellyfishClient<PeerMetadata, TrackMetadata>(); // if url is not provided, it will default to ws://localhost:4000/socket/websocket

const peerToken = prompt("Enter peer token") ?? "YOUR_PEER_TOKEN";

// Start the peer connection
client.connect({
  peerMetadata: { name: "peer" },
  isSimulcastOn: false,
  token: peerToken,
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
