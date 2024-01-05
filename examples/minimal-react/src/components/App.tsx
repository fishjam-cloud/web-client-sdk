import VideoPlayer from "./VideoPlayer";
import { JellyfishClient, SCREEN_SHARING_MEDIA_CONSTRAINTS } from "@jellyfish-dev/react-client-sdk";
import { useState } from "react";
import { useConnect, useDisconnect, useApi, useStatus, useTracks, useSelector } from "./client";

// Example metadata types for peer and track
// You can define your own metadata types just make sure they are serializable
export type PeerMetadata = {
  name: string;
};

export type TrackMetadata = {
  type: "camera" | "screen";
};

export const App = () => {
  const [token, setToken] = useState("");

  const connect = useConnect();
  const disconnect = useDisconnect();
  const api = useApi();
  const status = useStatus();
  const tracks = useTracks();

  {
    // for e2e test
    const client = useSelector((s) => s.connectivity.client);
    (window as unknown as { client: JellyfishClient<PeerMetadata, TrackMetadata> }).client = client!;
  }

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
      {Object.values(tracks).map(({ stream, trackId, origin }) => (
        <VideoPlayer key={trackId} stream={stream} peerId={origin.id} /> // Simple component to render a video element
      ))}
    </div>
  );
};
