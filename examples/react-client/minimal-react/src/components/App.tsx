import {
  useCamera,
  useConnection,
  useMicrophone,
  usePeers,
  useScreenShare,
} from "@fishjam-cloud/react-client";
import { useStatistics } from "@fishjam-cloud/react-client/debug";
import { Fragment, useState } from "react";

import AudioPlayer from "./AudioPlayer";
import VideoPlayer from "./VideoPlayer";

export const App = () => {
  const [token, setToken] = useState("");

  const { joinRoom, leaveRoom, peerStatus } = useConnection();

  const { remotePeers } = usePeers();
  const screenShare = useScreenShare();
  const { isCameraOn, toggleCamera } = useCamera();
  const { isMicrophoneOn, toggleMicrophone } = useMicrophone();
  const { getStatistics } = useStatistics();

  {
    // for e2e test
    (window as unknown as Record<string, unknown>).getStatistics =
      getStatistics;
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
            if (!token) throw Error("Token is empty");
            joinRoom({
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

        <button
          disabled={isCameraOn || peerStatus !== "connected"}
          onClick={toggleCamera}
        >
          Start camera
        </button>

        <button
          disabled={isMicrophoneOn || peerStatus !== "connected"}
          onClick={toggleMicrophone}
        >
          Start microphone
        </button>

        <span>Status: {peerStatus}</span>
      </div>

      {/* Render the video remote tracks from other peers*/}
      {remotePeers.map(
        ({ id, cameraTrack, microphoneTrack, screenShareVideoTrack }) => {
          const cameraStream = cameraTrack?.stream;
          const microphoneStream = microphoneTrack?.stream;
          const screenShareStream = screenShareVideoTrack?.stream;

          return (
            <Fragment key={id}>
              {cameraStream && (
                <VideoPlayer stream={cameraStream} peerId={id} />
              )}
              {microphoneStream && <AudioPlayer stream={microphoneStream} />}
              {screenShareStream && (
                <VideoPlayer stream={screenShareStream} peerId={id} />
              )}
            </Fragment>
          );
        },
      )}
    </div>
  );
};
