import {
  useConnection,
  useCustomSource,
  usePeers,
} from "@fishjam-cloud/react-client";
import { useEffect, useState } from "react";

import { CAMERA_INPUT_ID } from "../config";
import { useSmelter } from "../hooks/useSmelter";
import { TextOverlayStream } from "./TextOverlayStream";
import VideoPlayer from "./VideoPlayer";

const FISHJAM_URL = "ws://localhost:5002";
const CAMERA_OUTPUT_ID = "camera";
const WIDTH = 640;
const HEIGHT = 480;

export const App = () => {
  const [token, setToken] = useState("");
  const { joinRoom, leaveRoom, peerStatus } = useConnection();
  const { remotePeers } = usePeers();
  const smelter = useSmelter();
  const {
    setStream,
    startStreaming,
    source: { stream },
  } = useCustomSource("text-camera");
  const isConnected = peerStatus === "connected";

  const startCustomCamera = async () => {
    await smelter?.registerInput(CAMERA_INPUT_ID, {
      type: "camera",
    });
    const output = await smelter?.registerOutput(
      CAMERA_OUTPUT_ID,
      <TextOverlayStream
        text="Smelter demo"
        width={WIDTH}
        height={HEIGHT}
        inputId={CAMERA_INPUT_ID}
      />,
      {
        type: "stream",
        video: {
          resolution: { width: WIDTH, height: HEIGHT },
        },
      },
    );

    const outputStream = output?.stream;
    if (outputStream) setStream(outputStream);
  };

  useEffect(() => {
    if (stream && isConnected) startStreaming();
  }, [stream, isConnected, startStreaming]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <input
        value={token}
        onChange={(e) => setToken(() => e?.target?.value)}
        placeholder="token"
      />
      <div style={{ display: "flex", flexDirection: "row", gap: "8px" }}>
        <button
          disabled={!smelter || !!stream}
          onClick={() => startCustomCamera()}
        >
          Start camera
        </button>
        <button
          disabled={token === "" || isConnected}
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
          disabled={!isConnected}
          onClick={() => {
            leaveRoom();
          }}
        >
          Disconnect
        </button>
        <span>Status: {peerStatus}</span>
      </div>

      <div style={{ margin: "auto", maxWidth: WIDTH, maxHeight: HEIGHT }}>
        {stream && <VideoPlayer stream={stream} />}
      </div>
      {/* Render the video remote tracks from other peers*/}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: "8px",
          margin: "auto",
        }}
      >
        {remotePeers.map(({ id, customVideoTracks }) => {
          const remoteStream = customVideoTracks?.[0]?.stream;
          return (
            remoteStream && (
              <div style={{ maxWidth: WIDTH, maxHeight: HEIGHT }} key={id}>
                <VideoPlayer stream={remoteStream} />
              </div>
            )
          );
        })}
      </div>
    </div>
  );
};
