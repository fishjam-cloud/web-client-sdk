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

const OriginalWebSocket = window.WebSocket;

export const App = () => {
  const [token, setToken] = useState("");
  const [offline, setOffline] = useState(false);

  const { joinRoom, leaveRoom, peerStatus, reconnectionStatus } = useConnection();

  const { remotePeers } = usePeers();
  const screenShare = useScreenShare();
  const { isCameraOn, toggleCamera } = useCamera();
  const { isMicrophoneOn, toggleMicrophone } = useMicrophone();
  const { getStatistics } = useStatistics();

  {
    (window as unknown as Record<string, unknown>).getStatistics =
      getStatistics;
  }

  const goOffline = () => {
    console.log("[DEBUG] Going OFFLINE — closing WS and blocking new connections");
    const client = (window as unknown as Record<string, unknown>).__fishjamClient as Record<string, unknown>;
    const ws = client.websocket as WebSocket | null;
    if (ws) ws.close();

    window.WebSocket = class BlockedWebSocket extends EventTarget {
      constructor(url: string | URL, protocols?: string | string[]) {
        super();
        console.log(`[DEBUG] WebSocket blocked (offline): ${url}`);
        setTimeout(() => {
          this.dispatchEvent(new Event("error"));
          this.dispatchEvent(new CloseEvent("close", { code: 1006, reason: "", wasClean: false }));
        }, 100);
      }
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSING = 2;
      readonly CLOSED = 3;
      readyState = 3;
      binaryType: BinaryType = "blob";
      bufferedAmount = 0;
      extensions = "";
      protocol = "";
      url = "";
      onopen: ((ev: Event) => void) | null = null;
      onclose: ((ev: CloseEvent) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      close() {}
      send() {}
    } as unknown as typeof WebSocket;

    setOffline(true);
  };

  const goOnline = () => {
    console.log("[DEBUG] Going ONLINE — restoring WebSocket");
    window.WebSocket = OriginalWebSocket;
    setOffline(false);
  };

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
            joinRoom({ peerToken: token });
          }}
        >
          Connect
        </button>

        <button
          disabled={peerStatus !== "connected"}
          onClick={() => leaveRoom()}
        >
          Disconnect
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

        <button
          disabled={offline}
          onClick={goOffline}
          style={{ background: "#fcc" }}
        >
          Go Offline
        </button>

        <button
          disabled={!offline}
          onClick={goOnline}
          style={{ background: "#cfc" }}
        >
          Go Online
        </button>

        <span>
          Status: {peerStatus} | Reconnection: {reconnectionStatus}
          {offline ? " | OFFLINE" : ""}
        </span>
      </div>

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
