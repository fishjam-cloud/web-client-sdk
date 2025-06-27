import { useLivestream } from "@fishjam-cloud/react-client";
import { useState } from "react";

import VideoPlayer from "./VideoPlayer";
import { Card } from "./ui/card";

export const App = () => {
  const [token, setToken] = useState("");
  const [url, setUrl] = useState("https://fishjam.io/api/v1/live/api/whep");

  const { connect, disconnect, stream } = useLivestream();

  return (
    <div className="flex flex-col gap-8">
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

      <div className="flex gap-8">
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

      {stream && <VideoPlayer stream={stream} />}
    </div>
  );
};
