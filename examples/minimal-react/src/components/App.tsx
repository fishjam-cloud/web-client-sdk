import React, { useEffect } from "react";
import { create } from "@jellyfish-dev/react-client-sdk/experimental";
import VideoPlayer from "./VideoPlayer";
import { SCREEN_SHARING_MEDIA_CONSTRAINTS } from "@jellyfish-dev/browser-media-utils";
import { Peer } from "@jellyfish-dev/ts-client-sdk";

// Example metadata types for peer and track
// You can define your own metadata types just make sure they are serializable
type PeerMetadata = {
  name: string;
};

type TrackMetadata = {
  type: "camera" | "screen";
};

// Create a Membrane client instance
const { useSelector, useConnect } = create<PeerMetadata, TrackMetadata>();

// Start the peer connection
const peerToken = prompt("Enter peer token") ?? "YOUR_PEER_TOKEN";

export const App = () => {
  // Create the connect function
  const connect = useConnect();

  // Get the full state
  const remoteTracks = useSelector((snapshot) => Object.values(snapshot?.remote || {}));

  // Get the webrtcApi reference
  const webrtcApi = useSelector((snapshot) => snapshot.connectivity.api);

  // Get jellyfish client reference
  const jellyfishClient = useSelector((snapshot) => snapshot.connectivity.client);

  useEffect(() => {
    const disconnect = connect({
      peerMetadata: { name: "peer" },
      token: peerToken,
    });

    return () => {
      // Disconnect the peer when the component unmounts
      disconnect();
    };
  }, [connect]);

  useEffect(() => {
    async function startScreenSharing() {
      // Check if webrtc is initialized
      if (!webrtcApi) return console.error("webrtc is not initialized");

      // Create a new MediaStream to add tracks to
      const localStream: MediaStream = new MediaStream();

      // Get screen sharing MediaStream
      const screenStream = await navigator.mediaDevices.getDisplayMedia(SCREEN_SHARING_MEDIA_CONSTRAINTS);

      // Add tracks from screen sharing MediaStream to local MediaStream
      screenStream.getTracks().forEach((track) => localStream.addTrack(track));

      // Add local MediaStream to webrtc
      localStream.getTracks().forEach((track) => webrtcApi.addTrack(track, localStream, { type: "screen" }));
    }

    const onJoinSuccess = (peerId: string, peersInRoom: Peer[]) => {
      console.log("join success");
      console.log("peerId", peerId);
      console.log("peersInRoom", peersInRoom);

      // To start broadcasting your media you will need source of MediaStream like camera, microphone or screen
      // In this example we will use screen sharing
      startScreenSharing();
    };

    // You can listen to events emitted by the client
    jellyfishClient?.on("joined", onJoinSuccess);

    return () => {
      // Remove the event listener when the component unmounts
      jellyfishClient?.off("joined", onJoinSuccess);
    };
  }, [jellyfishClient, webrtcApi]);

  // Render the remote tracks from other peers
  return (
    <>
      {remoteTracks.map(({ tracks }) => {
        return Object.values(tracks || {}).map(({ stream, trackId }) => (
          <VideoPlayer key={trackId} stream={stream} /> // Simple component to render a video element
        ));
      })}
    </>
  );
};
