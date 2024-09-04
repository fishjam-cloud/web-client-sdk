import VideoPlayer from "./VideoPlayer";
import {
  useConnect,
  useDisconnect,
  useFishjamClient,
  useParticipants,
  useScreenShare,
  useStatus,
} from "@fishjam-cloud/react-client";
import { useState, Fragment } from "react";

const FISHJAM_URL = "ws://localhost:5002";

export const App = () => {
  const [token, setToken] = useState("");

  const connect = useConnect();
  const disconnect = useDisconnect();
  const status = useStatus();
  const { participants } = useParticipants();
  const screenShare = useScreenShare();
  const client = useFishjamClient();

  {
    // for e2e test
    (window as unknown as Record<string, unknown>).client = client;
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
          onClick={async () => {
            // stream video only
            screenShare.startStreaming({ audioConstraints: false });
          }}
        >
          Start screen share
        </button>
        <span>Status: {status}</span>
      </div>

      {/* Render the video remote tracks from other peers*/}
      {participants.map((participant) => (
        <Fragment key={participant.id}>
          {participant.videoTracks.map((track) => (
            <VideoPlayer
              key={track.trackId}
              stream={track.stream}
              peerId={participant.id}
            />
          ))}
        </Fragment>
      ))}
    </div>
  );
};
