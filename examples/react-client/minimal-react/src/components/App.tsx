import VideoPlayer from "./VideoPlayer";
import {
  useConnect,
  useDisconnect,
  usePeers,
  useScreenShare,
  useStatus,
} from "@fishjam-cloud/react-client";
import { useFishjamClient_DO_NOT_USE } from "@fishjam-cloud/react-client/internal";
import { useState, Fragment } from "react";

const FISHJAM_URL = "ws://localhost:5002";

export const App = () => {
  const [token, setToken] = useState("");

  const connect = useConnect();
  const disconnect = useDisconnect();
  const status = useStatus();
  const { peers } = usePeers();
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
          disabled={token === "" || status === "connected"}
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
          disabled={status !== "connected"}
          onClick={() => {
            disconnect();
          }}
        >
          Disconnect
        </button>
        <button
          disabled={status !== "connected"}
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
      {peers.map(({ id, cameraTrack, screenShareVideoTrack }) => {
        const camera = cameraTrack?.stream;
        const screenShare = screenShareVideoTrack?.stream;

        return (
          <Fragment key={id}>
            {camera && <VideoPlayer stream={camera} peerId={id} />}
            {screenShare && <VideoPlayer stream={screenShare} peerId={id} />}
          </Fragment>
        );
      })}
    </div>
  );
};
