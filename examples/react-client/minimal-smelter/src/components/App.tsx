import {
  useConnection,
  useCustomSource,
  usePeers,
} from "@fishjam-cloud/react-client";
import { useEffect, useMemo, useState } from "react";

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
  const isConnected = useMemo(() => peerStatus === "connected", [peerStatus]);
  const { remotePeers, localPeer } = usePeers();
  const smelter = useSmelter();
  const { setStream, startStreaming, source } = useCustomSource("text-camera");

  useEffect(() => {
    if (!smelter || source.stream) return;
    let cancel = false;
    const register = async () => {
      const output = await smelter.registerOutput(
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

      const stream = output?.stream;
      if (stream && !cancel) setStream(stream);
    };

    const promise = register();
    return () => {
      cancel = true;
      promise
        .catch(console.error)
        .then(() => smelter.unregisterOutput(CAMERA_OUTPUT_ID))
        .catch(console.error);
    };
  }, [smelter, setStream, source.stream]);

  useEffect(() => {
    if (!isConnected || !source.stream) return;
    startStreaming();
  }, [isConnected, source.stream, startStreaming]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <input
        value={token}
        onChange={(e) => setToken(() => e?.target?.value)}
        placeholder="token"
      />
      <div style={{ display: "flex", flexDirection: "row", gap: "8px" }}>
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

      {localPeer && source.stream && (
        <VideoPlayer stream={source.stream} peerId={localPeer.id} />
      )}
      {/* Render the video remote tracks from other peers*/}
      {remotePeers.map(({ id, customVideoTracks }) => {
        const stream = customVideoTracks?.[0]?.stream;

        return stream && <VideoPlayer stream={stream} key={id} peerId={id} />;
      })}
    </div>
  );
};
