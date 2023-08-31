# Jellyfish React client

React client library for [Jellyfish](https://github.com/jellyfish-dev/jellyfish).
It is a wrapper around
the [Jellyfish TS client](https://github.com/jellyfish-dev/react-client-sdk/tree/main/src/jellyfish).

## Documentation

Documentation is available [here](https://jellyfish-dev.github.io/react-client-sdk/)

## Installation

You can install the library using `npm`:

```bash
npm install https://github.com/jellyfish-dev/react-client-sdk
```

It was tested with `nodejs` version mentioned in `.tool-versions` file.

## Usage

For pure TypeScript usage,
see [Jellyfish TS client](https://github.com/jellyfish-dev/react-client-sdk/tree/main/src/jellyfish).

Prerequisites:

- Running [Jellyfish](https://github.com/jellyfish-dev/jellyfish) server.
- Created room and token of peer in that room.
  You can use [dashboard](https://github.com/jellyfish-dev/jellyfish-dashboard) to create room and peer token.

This snippet is based
on [minimal-react](https://github.com/jellyfish-dev/react-client-sdk/tree/main/examples/minimal-react) example.

```tsx
// main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App, JellyfishContextProvider } from "./components/App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <JellyfishContextProvider>
      <App />
    </JellyfishContextProvider>
  </React.StrictMode>
);

// components/App.tsx
import VideoPlayer from "./VideoPlayer";
import { SCREEN_SHARING_MEDIA_CONSTRAINTS } from "@jellyfish-dev/react-client-sdk";
import { create } from "@jellyfish-dev/react-client-sdk";
import { useState } from "react";

// Example metadata types for peer and track
// You can define your own metadata types just make sure they are serializable
export type PeerMetadata = {
  name: string;
};

export type TrackMetadata = {
  type: "camera" | "screen";
};

// Create a Membrane client instance
// remember to use JellyfishContextProvider
export const { useApi, useTracks, useStatus, useConnect, useDisconnect, JellyfishContextProvider } = create<
  PeerMetadata,
  TrackMetadata
>();

export const App = () => {
  const [token, setToken] = useState("");

  const connect = useConnect();
  const disconnect = useDisconnect();
  const api = useApi();
  const status = useStatus();
  const tracks = useTracks();

  return (
    <div>
      <input value={token} onChange={(e) => setToken(() => e?.target?.value)} placeholder="token" />
      <div>
        <button
          disabled={token === "" || status === "joined"}
          onClick={() => {
            if (!token || token === "") throw Error("Token is empty");
            connect({
              peerMetadata: { name: "John Doe" }, // example metadata
              token: token,
            });
          }}
        >
          Connect
        </button>
        <button
          disabled={status !== "joined"}
          onClick={() => {
            disconnect();
          }}
        >
          Disconnect
        </button>
        <button
          disabled={status !== "joined"}
          onClick={() => {
            // Get screen sharing MediaStream
            navigator.mediaDevices.getDisplayMedia(SCREEN_SHARING_MEDIA_CONSTRAINTS).then((screenStream) => {
              // Add local MediaStream to webrtc
              screenStream.getTracks().forEach((track) => api.addTrack(track, screenStream, { type: "screen" }));
            });
          }}
        >
          Start screen share
        </button>
        <span>Status: {status}</span>
      </div>
      {/* Render the remote tracks from other peers*/}
      {Object.values(tracks).map(({ stream, trackId }) => (
        <VideoPlayer key={trackId} stream={stream} /> // Simple component to render a video element
      ))}
    </div>
  );
};
```

## Examples

For examples, see [examples](https://github.com/jellyfish-dev/react-client-sdk/tree/main/examples) folder.

More information about usage of webrtc can be found
in [MembraneWebRTC documentation](https://jellyfish-dev.github.io/membrane-webrtc-js/).

## Documentation

Can be found [here](https://jellyfish-dev.github.io/react-client-sdk/) or you can generate it locally:

```bash
npm run docs
```
