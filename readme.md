# Fishjam React client

React client library for [Fishjam](https://github.com/fishjam-dev/fishjam).
It is a wrapper around
the [Fishjam TS client](https://github.com/fishjam-dev/ts-client-sdk).

## Documentation

Documentation is available [here](https://fishjam-dev.github.io/react-client-sdk/) or you can generate it locally:

```bash
npm run docs
```

## Installation

You can install the library using `npm`:

```bash
npm install @fishjam-dev/react-client
```

It was tested with `nodejs` version mentioned in `.tool-versions` file.

## Usage

For pure TypeScript usage,
see [Fishjam TS client](https://github.com/fishjam-dev/ts-client-sdk).

Prerequisites:

- Running [Fishjam](https://github.com/fishjam-dev/fishjam) server.
- Created room and token of peer in that room.
  You can use [dashboard](https://github.com/fishjam-dev/fishjam-dashboard) to create room and peer token.

This snippet is based
on [minimal-react](https://github.com/fishjam-dev/react-client-sdk/tree/main/examples/minimal-react) example.

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
import { SCREEN_SHARING_MEDIA_CONSTRAINTS } from "@fishjam-dev/react-client";
import { create } from "@fishjam-dev/react-client";
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
// remember to use FishjamContextProvider
export const { useApi, useTracks, useStatus, useConnect, useDisconnect, FishjamContextProvider } = create<
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

## Contributing

We welcome contributions to this SDK. Please report any bugs or issues you find or feel free to make a pull request with your own bug fixes and/or features.

Detailed information about contributing to Fishjam Dashboard can be found in [contributing](./CONTRIBUTING.md) document.

### Releasing new versions

To release a new version of the package, go to `Actions` > `Release package` workflow and trigger it with the chosen release type.
The workflow will bump the package version in `package.json`, release the package to NPM, create a new git tag and a GitHub release.

## Examples

For examples, see [examples](https://github.com/fishjam-dev/react-client-sdk/tree/main/examples) folder.

More information about usage of webrtc can be found
in [MembraneWebRTC documentation](https://fishjam-dev.github.io/membrane-webrtc-js/).

## Fishjam ecosystem

|             |                                                                                                                                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client SDKs | [React](https://github.com/fishjam-dev/react-client-sdk), [React Native](https://github.com/fishjam-dev/react-native-client-sdk), [iOs](https://github.com/fishjam-dev/ios-client-sdk), [Android](https://github.com/fishjam-dev/android-client-sdk) |
| Server SDKs | [Elixir](https://github.com/fishjam-dev/elixir_server_sdk), [Python](https://github.com/fishjam-dev/python-server-sdk), [OpenAPI](https://fishjam-dev.github.io/fishjam-docs/api_reference/rest_api)                                                 |
| Services    | [Videoroom](https://github.com/fishjam-dev/fishjam-videoroom) - an example videoconferencing app written in elixir <br/> [Dashboard](https://github.com/fishjam-dev/fishjam-dashboard) - an internal tool used to showcase Fishjam's capabilities    |
| Resources   | [Fishjam Book](https://fishjam-dev.github.io/book/) - theory of the framework, [Docs](https://fishjam-dev.github.io/fishjam-docs/), [Tutorials](https://github.com/fishjam-dev/fishjam-clients-tutorials)                                            |
| Membrane    | Fishjam is based on [Membrane](https://membrane.stream/), [Discord](https://discord.gg/nwnfVSY)                                                                                                                                                      |
| Compositor  | [Compositor](https://github.com/membraneframework/membrane_video_compositor_plugin) - Membrane plugin to transform video                                                                                                                             |
| Protobufs   | If you want to use Fishjam on your own, you can use our [protobufs](https://github.com/fishjam-dev/protos)                                                                                                                                           |

## Copyright and License

Copyright 2023, [Software Mansion](https://swmansion.com/?utm_source=git&utm_medium=readme&utm_campaign=fishjam)

[![Software Mansion](https://logo.swmansion.com/logo?color=white&variant=desktop&width=200&tag=membrane-github)](https://swmansion.com/?utm_source=git&utm_medium=readme&utm_campaign=fishjam)

Licensed under the [Apache License, Version 2.0](LICENSE)
