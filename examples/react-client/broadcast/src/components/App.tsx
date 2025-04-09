import { useBroadcast } from "@fishjam-cloud/react-client";
import { useState } from "react";

import VideoPlayer from "./VideoPlayer";

export const App = () => {
  const [token, setToken] = useState("");
  const [url, setUrl] = useState("");

  const { connect, disconnect, stream } = useBroadcast();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <input
        value={url}
        onChange={(e) => setUrl(() => e?.target?.value)}
        placeholder="url"
      />

      <input
        value={token}
        onChange={(e) => setToken(() => e?.target?.value)}
        placeholder="token"
      />

      <div style={{ display: "flex", flexDirection: "row", gap: "8px" }}>
        <button
          disabled={token === "" || url === "" || !!stream}
          onClick={() => {
            if (token === "") throw Error("Token is empty");
            if (url === "") throw Error("Url is empty");
            connect(url, token);
          }}
        >
          Connect
        </button>

        <button
          disabled={!stream}
          onClick={() => {
            disconnect();
          }}
        >
          Disconnect
        </button>
      </div>

      {stream && <VideoPlayer stream={stream} peerId={"stream"} />}
    </div>
  );
};
