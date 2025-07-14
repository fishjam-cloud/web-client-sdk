import {
  useConnection,
  useCustomSource,
  usePeers,
} from "@fishjam-cloud/react-client";
import { useState } from "react";

import { CAMERA_INPUT_ID } from "../config";
import { useSmelter } from "../hooks/useSmelter";
import { TextOverlayStream } from "./TextOverlayStream";
import VideoPlayer from "./VideoPlayer";

const CAMERA_OUTPUT_ID = "camera";
const WIDTH = 640;
const HEIGHT = 480;

export const App = () => {
  const [fishjamUrl, setFishjamUrl] = useState("");
  const [peerToken, setPeerToken] = useState("");
  const { joinRoom, leaveRoom, peerStatus } = useConnection();
  const { remotePeers } = usePeers();
  const smelter = useSmelter();
  const { setStream, stream } = useCustomSource("text-camera");
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <input
        value={fishjamUrl}
        onChange={(e) => setFishjamUrl(() => e?.target?.value)}
        placeholder="Fishjam URL"
      />
      <input
        value={peerToken}
        onChange={(e) => setPeerToken(() => e?.target?.value)}
        placeholder="Peer token"
      />
      <div style={{ display: "flex", flexDirection: "row", gap: "8px" }}>
        <button
          disabled={!smelter || !!stream}
          onClick={() => startCustomCamera()}
        >
          Start camera
        </button>
        <button
          disabled={!fishjamUrl || !peerToken || isConnected}
          onClick={() => {
            joinRoom({
              url: fishjamUrl,
              peerToken,
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
