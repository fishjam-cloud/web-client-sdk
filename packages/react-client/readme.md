<img src="https://raw.githubusercontent.com/fishjam-cloud/web-client-sdk/main/.github/images/fishjam-card.png" width="100%" />

# @fishjam-cloud/react-client

React SDK for [Fishjam](https://fishjam.io), Software Mansion's real-time video and audio streaming service. Use it
to add video conferencing, audio rooms or livestreaming to a React web app.

It provides `FishjamProvider` and React hooks to join a room, publish your camera, microphone or screen, and receive
other peers' tracks. It is built on top of [`@fishjam-cloud/ts-client`](https://www.npmjs.com/package/@fishjam-cloud/ts-client).

## Installation

```bash
npm install @fishjam-cloud/react-client
```

## Quick start

Wrap your app in `FishjamProvider` with your Fishjam ID from the [Fishjam dashboard](https://fishjam.io/app):

```tsx
import { FishjamProvider } from "@fishjam-cloud/react-client";

export default function Root() {
  return (
    <FishjamProvider fishjamId="YOUR_FISHJAM_ID">
      <App />
    </FishjamProvider>
  );
}
```

Then join a room with a peer token:

```tsx
import { useConnection, useInitializeDevices, useSandbox } from "@fishjam-cloud/react-client";

export function JoinRoomButton() {
  const { joinRoom } = useConnection();
  const { initializeDevices } = useInitializeDevices();
  const { getSandboxPeerToken } = useSandbox({ sandboxApiUrl: "YOUR_SANDBOX_API_URL" });

  const handleJoinRoom = async () => {
    // The Sandbox API is for testing only. In production, get the peer token from your own backend.
    const peerToken = await getSandboxPeerToken("testRoom", "testUser");

    await initializeDevices();
    await joinRoom({ peerToken });
  };

  return <button onClick={handleJoinRoom}>Join Room</button>;
}
```

The [React quick start](https://fishjam.swmansion.com/docs/tutorials/react-quick-start) continues from here: it shows
how to display your own video and other peers.

## Documentation

- [React quick start](https://fishjam.swmansion.com/docs/tutorials/react-quick-start)
- [Installation](https://fishjam.swmansion.com/docs/how-to/client/installation)
- [API reference](https://fishjam.swmansion.com/docs/api/web)
- [Documentation home](https://fishjam.swmansion.com/docs)

## Examples

- [`minimal-react`](https://github.com/fishjam-cloud/web-client-sdk/tree/main/examples/react-client/minimal-react):
  connect to a room, publish your camera, microphone and screen
- [Fishjam examples repository](https://github.com/fishjam-cloud/examples): more apps built with the Fishjam SDKs

## License

Licensed under the [Apache License, Version 2.0](https://github.com/fishjam-cloud/web-client-sdk/blob/main/LICENSE).

## Fishjam is created by Software Mansion

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with experience in building web and mobile
apps. We are Core React Native Contributors and experts in dealing with all kinds of React Native issues. We can help
you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=fishjam&utm_medium=web-readme).

[![Software Mansion](https://logo.swmansion.com/logo?color=white&variant=desktop&width=200&tag=react-client)](https://swmansion.com/contact/projects?utm_source=fishjam&utm_medium=web-readme)
