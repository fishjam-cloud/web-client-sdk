import VideoPlayer from "./VideoPlayer";
import { SCREEN_SHARING_MEDIA_CONSTRAINTS } from "@jellyfish-dev/browser-media-utils";
import { Peer, create, JellyfishClient } from "@jellyfish-dev/react-client-sdk";
import { useState } from "react";

// Example metadata types for peer and track
// You can define your own metadata types just make sure they are serializable
export type PeerMetadata = {
  name: string;
};

export type TrackMetadata = {
  type: "camera" | "screen";
};

// Create a Membrane client instance
// remember to use JellyfishContextProvider
export const { useApi, useTracks, useStatus, useConnect, useDisconnect, JellyfishContextProvider } = create<
  PeerMetadata,
  TrackMetadata
>();

export const App = () => {
  const [token, setToken] = useState("");

  const connect = useConnect();
  const disconnect = useDisconnect();
  const api = useApi();
  const status = useStatus();
  const tracks = useTracks();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <input value={token} onChange={(e) => setToken(() => e?.target?.value)} placeholder="token" />
      <div style={{ display: "flex", flexDirection: "row", gap: "8px" }}>
        <button
          disabled={token === "" || status === "joined"}
          onClick={() => {
            if (!token || token === "") throw Error("Token is empty");
            connect({
              peerMetadata: { name: "John Doe" }, // example metadata
              token: token,
            });
          }}
        >
          Connect
        </button>
        <button
          disabled={status !== "joined"}
          onClick={() => {
            disconnect();
          }}
        >
          Disconnect
        </button>
        <button
          disabled={status !== "joined"}
          onClick={() => {
            // Get screen sharing MediaStream
            navigator.mediaDevices.getDisplayMedia(SCREEN_SHARING_MEDIA_CONSTRAINTS).then((screenStream) => {
              // Add local MediaStream to webrtc
              screenStream.getTracks().forEach((track) => api.addTrack(track, screenStream, { type: "screen" }));
            });
          }}
        >
          Start screen share
        </button>
        <span>Status: {status}</span>
      </div>
      {/* Render the remote tracks from other peers*/}
      {Object.values(tracks).map(({ stream, trackId }) => (
        <VideoPlayer key={trackId} stream={stream} /> // Simple component to render a video element
      ))}
    </div>
  );
};
