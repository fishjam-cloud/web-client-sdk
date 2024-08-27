import VideoPlayer from "./VideoPlayer";
import type { Client } from "@fishjam-cloud/react-client";
import { SCREEN_SHARING_MEDIA_CONSTRAINTS } from "@fishjam-cloud/react-client";
import { useState } from "react";
import {
  useConnect,
  useDisconnect,
  useClient,
  useStatus,
  useTracks,
} from "./client";

const FISHJAM_URL = "ws://localhost:5002";

export const App = () => {
  const [token, setToken] = useState("");

  const connect = useConnect();
  const disconnect = useDisconnect();
  const client = useClient();
  const status = useStatus();
  const tracks = useTracks();

  {
    // for e2e test
    const client = useClient();
    (window as unknown as { client: Client }).client = client!;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <input
        value={token}
        onChange={(e) => setToken(() => e?.target?.value)}
        placeholder="token"
      />
      <div style={{ display: "flex", flexDirection: "row", gap: "8px" }}>
        <button
          disabled={token === "" || status === "joined"}
          onClick={() => {
            if (!token || token === "") throw Error("Token is empty");
            connect({
              token: token,
              url: FISHJAM_URL,
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
            navigator.mediaDevices
              .getDisplayMedia(SCREEN_SHARING_MEDIA_CONSTRAINTS)
              .then((screenStream) => {
                // Add local MediaStream to webrtc
                screenStream
                  .getTracks()
                  .forEach((track) => client.addTrack(track));
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
