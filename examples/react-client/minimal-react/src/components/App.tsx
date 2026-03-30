import {
  useCamera,
  useConnection,
  useMicrophone,
  usePeers,
  useScreenShare,
  Variant,
} from "@fishjam-cloud/react-client";
import { useStatistics } from "@fishjam-cloud/react-client/debug";
import { Fragment, useState } from "react";

import AudioPlayer from "./AudioPlayer";
import VideoPlayer from "./VideoPlayer";

const variantLabel = (variant: Variant | null | undefined): string => {
  switch (variant) {
    case Variant.VARIANT_LOW:
      return "Low";
    case Variant.VARIANT_MEDIUM:
      return "Medium";
    case Variant.VARIANT_HIGH:
      return "High";
    default:
      return "N/A";
  }
};

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
                <div>
                  <VideoPlayer stream={cameraStream} peerId={id} />
                  <div
                    style={{
                      display: "flex",
                      gap: "4px",
                      alignItems: "center",
                      marginTop: "4px",
                    }}
                  >
                    <span>
                      Received quality:{" "}
                      {variantLabel(cameraTrack?.receivedQuality)}
                    </span>
                    {[
                      Variant.VARIANT_LOW,
                      Variant.VARIANT_MEDIUM,
                      Variant.VARIANT_HIGH,
                    ].map((variant) => (
                      <button
                        key={variant}
                        disabled={cameraTrack?.receivedQuality === variant}
                        onClick={() => {
                          cameraTrack?.setReceivedQuality(variant);
                        }}
                      >
                        {variantLabel(variant)}
                      </button>
                    ))}
                  </div>
                </div>
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
