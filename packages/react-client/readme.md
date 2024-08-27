[![NPM Version](https://img.shields.io/npm/v/@fishjam-cloud/react-client)](https://www.npmjs.com/package/@fishjam-cloud/react-client)
[![TypeScript Strict](https://badgen.net/badge/TS/Strict)](https://www.typescriptlang.org)
[![TypeDoc](https://img.shields.io/badge/TypeDoc-8A2BE2)](https://fishjam-cloud.github.io/web-client-sdk/modules/_fishjam_dev_react_client.html)

# Fishjam React Client

React client library for [Fishjam Cloud](https://cloud.fishjam.stream).
It is a wrapper around
the [TS client](../ts-client/README.md).

## Documentation

Documentation is available [here](https://fishjam-cloud.github.io/web-client-sdk/modules/_fishjam_dev_react_client.html) or you can generate it locally:

```bash
yarn run docs
```

## Installation

You can install this package using `npm`:

```bash
npm install @fishjam-cloud/react-client
```

or `yarn`:

```bash
yarn @fishjam-cloud/react-client
```

## Usage

Prerequisites:

- Account on [Fishjam Cloud](https://cloud.fishjam.stream) with App configured.
- Created room and token of peer in that room.
  You can use Room Manager to create room and peer token.

This snippet is based
on [minimal-react](../../examples/react-client/minimal-react/) example.

```tsx
// main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App, FishjamContextProvider } from "./components/App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <FishjamContextProvider>
      <App />
    </FishjamContextProvider>
  </React.StrictMode>,
);

// components/App.tsx
import VideoPlayer from "./VideoPlayer";
import { SCREEN_SHARING_MEDIA_CONSTRAINTS } from "@fishjam-cloud/react-client";
import { create } from "@fishjam-cloud/react-client";
import { useState } from "react";

// Create a Fishjam client instance
// remember to use FishjamContextProvider
export const { useApi, useTracks, useStatus, useConnect, useDisconnect, FishjamContextProvider } = create();

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
              screenStream.getTracks().forEach((track) => api.addTrack(track, { type: "screen" }));
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

For examples, see [examples](../../examples/react-client/) folder.

## Copyright and License

Copyright 2024, [Software Mansion](https://swmansion.com/?utm_source=git&utm_medium=readme&utm_campaign=react-client)

[![Software Mansion](https://logo.swmansion.com/logo?color=white&variant=desktop&width=200&tag=react-client)](https://swmansion.com/?utm_source=git&utm_medium=readme&utm_campaign=react-client)

Licensed under the [Apache License, Version 2.0](LICENSE)
