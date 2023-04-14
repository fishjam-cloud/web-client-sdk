# Jellyfish React client

React client library for [Jellyfish](https://github.com/jellyfish-dev/jellyfish).
It is a wrapper around the [Jellyfish TS client](https://github.com/jellyfish-dev/react-client-sdk/tree/main/src/jellyfish).

## Documentation

Documentation is available [here](https://jellyfish-dev.github.io/react-client-sdk/)

## Installation

You can install the library using `npm`:

```bash
npm install https://github.com/jellyfish-dev/react-client-sdk
```

It was tested with `nodejs` version mentioned in `.tool-versions` file.

## Usage

For pure TypeScript usage, see [Jellyfish TS client](https://github.com/jellyfish-dev/react-client-sdk/tree/main/src/jellyfish).

Prerequisites:

- Running [Jellyfish](https://github.com/jellyfish-dev/jellyfish) server.
- Created room and token of peer in that room.
  You u can use [dashboard](https://github.com/jellyfish-dev/react-client-sdk/tree/main/examples/dashboard) example to create room and peer token.

This snippet is based on [minimal-react](https://github.com/jellyfish-dev/react-client-sdk/tree/main/examples/minimal-react) example.

```ts
import { createNoContextMembraneClient } from "@jellyfish-dev/react-client-sdk/externalState";
import { SCREEN_SHARING_MEDIA_CONSTRAINTS } from "@jellyfish-dev/react-client-sdk/navigator";

export const App = () => {
  // Create a Membrane client instance
  const [client] = useState(createNoContextMembraneClient());

  // Create the connect function
  const connect = client.useConnect();

  // Get the webrtcApi reference
  const webrtcApi = client.useSelector((snapshot) => snapshot.connectivity.api);

  // Get jellyfish client reference
  const jellyfishClient = client.useSelector((snapshot) => snapshot.connectivity.client);

  useEffect(() => {
    const peerToken = "YOUR_PEER_TOKEN";

    // Start the peer connection
    const disconnect = connect({
      peerMetadata: {},
      token: peerToken,
    });

    return () => {
      // Disconnect the peer when the component unmounts
      disconnect();
    };
  }, [connect]);

  useEffect(() => {
    async function startScreenSharing() {
      // Check if webrtc is initialized
      if (!webrtcApi) return console.error("webrtc is not initialized");

      // Create a new MediaStream to add tracks to
      const localStream: MediaStream = new MediaStream();

      // Get screen sharing MediaStream
      const screenStream = await navigator.mediaDevices.getDisplayMedia(SCREEN_SHARING_MEDIA_CONSTRAINTS);

      // Add tracks from screen sharing MediaStream to local MediaStream
      screenStream.getTracks().forEach((track) => localStream.addTrack(track));

      // Add local MediaStream to webrtc
      localStream.getTracks().forEach((track) => webrtcApi.addTrack(track, localStream));
    }

    const onJoinSuccess = (peerId: string, peersInRoom: [Peer]) => {
      console.log("join success");

      // To start broadcasting your media you will need source of MediaStream like camera, microphone or screen
      // In this example we will use screen sharing
      startScreenSharing();
    };

    // You can listen to events emitted by the client
    jellyfishClient?.on("onJoinSuccess", onJoinSuccess);

    return () => {
      // Remove the event listener when the component unmounts
      jellyfishClient?.off("onJoinSuccess", onJoinSuccess);
    };
  }, [jellyfishClient, webrtcApi]);

  // Render the remote tracks from other peers
  return <>...</>;
};
```

## Examples

For examples, see [examples](https://github.com/jellyfish-dev/react-client-sdk/tree/main/examples) folder.

More information about usage of webrtc can be found in [MembraneWebRTC documentation](https://jellyfish-dev.github.io/membrane-webrtc-js/).

## Documentation

Can be found [here](https://jellyfish-dev.github.io/react-client-sdk/) or you can generate it locally:

```bash
npm run docs
```
