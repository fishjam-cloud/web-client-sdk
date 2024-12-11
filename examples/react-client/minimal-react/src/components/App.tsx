import {
  useConnection,
  usePeers,
  useScreenShare,
} from "@fishjam-cloud/react-client";
import { useFishjamClient_DO_NOT_USE } from "@fishjam-cloud/react-client/internal";
import { Fragment, useState } from "react";

import VideoPlayer from "./VideoPlayer";

const FISHJAM_URL = "ws://localhost:5002";

export const App = () => {
  const [token, setToken] = useState("");

  const { joinRoom, leaveRoom, peerStatus } = useConnection();

  const { remotePeers } = usePeers();
  const screenShare = useScreenShare();
  const client = useFishjamClient_DO_NOT_USE();

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
          disabled={token === "" || peerStatus === "connected"}
          onClick={() => {
            if (!token || token === "") throw Error("Token is empty");
            joinRoom({
              url: FISHJAM_URL,
              peerToken: token,
            });
          }}
        >
          Connect
        </button>
        <button
          disabled={peerStatus !== "connected"}
          onClick={() => {
            leaveRoom();
          }}
        >
          Disconnect
        </button>
        <button
          disabled={peerStatus !== "connected"}
          onClick={async () => {
            // stream video only
            screenShare.startStreaming({ audioConstraints: false });
          }}
        >
          Start screen share
        </button>
        <span>Status: {peerStatus}</span>
      </div>

      {/* Render the video remote tracks from other peers*/}
      {remotePeers.map(({ id, cameraTrack, screenShareVideoTrack }) => {
        const camera = cameraTrack?.stream;
        const screenShareStream = screenShareVideoTrack?.stream;

        return (
          <Fragment key={id}>
            {camera && <VideoPlayer stream={camera} peerId={id} />}
            {screenShareStream && (
              <VideoPlayer stream={screenShareStream} peerId={id} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
};
