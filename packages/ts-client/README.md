[![NPM Version](https://img.shields.io/npm/v/@fishjam-cloud/ts-client)](https://www.npmjs.com/package/@fishjam-cloud/ts-client)
[![TypeScript Strict](https://badgen.net/badge/TS/Strict)](https://www.typescriptlang.org)
[![TypeDoc](https://img.shields.io/badge/TypeDoc-8A2BE2)](https://fishjam-cloud.github.io/web-client-sdk/modules/_fishjam_dev_ts_client.html)

# Fishjam TS Client

TypeScript client library for [Fishjam Cloud](https://cloud.fishjam.stream).

## Documentation

Documentation is available [here](https://fishjam-cloud.github.io/web-client-sdk/modules/_fishjam_dev_ts_client.html) or
you can generate it locally:

```bash
yarn run docs
```

## Installation

You can install this package using `npm`:

```bash
npm install @fishjam-cloud/ts-client
```

or `yarn`:

```bash
yarn @fishjam-cloud/ts-client
```

## Usage

Prerequisites:

- Account on [Fishjam Cloud](https://cloud.fishjam.stream) with App configured.
- Created room and token of peer in that room. You can use Room Manager to create room and peer token.

The following code snippet is based on the [minimal](../../examples/ts-client/minimal/) example.

```ts
import { FishjamClient, WebRTCEndpoint } from '@fishjam-cloud/ts-client';

const SCREEN_SHARING_MEDIA_CONSTRAINTS = {
  video: {
    frameRate: { ideal: 20, max: 25 },
    width: { max: 1920, ideal: 1920 },
    height: { max: 1080, ideal: 1080 },
  },
};

// Example metadata types for peer and track
// You can define your own metadata types, just make sure they are serializable
type PeerMetadata = {
  name: string;
};

type TrackMetadata = {
  type: 'camera' | 'screen';
};

// Create a new FishjamClient object to interact with Fishjam
const client = new FishjamClient<PeerMetadata, TrackMetadata>();

const peerToken = prompt('Enter peer token') ?? 'YOUR_PEER_TOKEN';

// Start the peer connection
client.connect({
  peerMetadata: { name: 'peer' },
  token: peerToken,
  // if the 'signaling' field is missing, the client will connect to ws://localhost:5002/socket/peer/websocket
});

// You can listen to events emitted by the client
client.on('joined', (peerId, peersInRoom) => {
  // Check if webrtc is initialized
  if (!client.webrtc) return console.error('webrtc is not initialized');

  // To start broadcasting your media, you will need a source of MediaStream like a camera, microphone, or screen
  // In this example, we will use screen sharing
  startScreenSharing(client.webrtc);
});

// To receive media from other peers, you need to listen to the onTrackReady event
client.on('trackReady', (ctx) => {
  const peerId = ctx.peer.id;

  document.getElementById(peerId)?.remove(); // remove previous video element if it exists

  // Create a new video element to display the media
  const videoPlayer = document.createElement('video');
  videoPlayer.id = peerId;
  videoPlayer.oncanplaythrough = function () {
    // Chrome blocks autoplay of unmuted video
    videoPlayer.muted = true;
    videoPlayer.play();
  };
  document.body.appendChild(videoPlayer);

  videoPlayer.srcObject = ctx.stream; // assign MediaStream to video element
});

// Cleanup video element when track is removed
client.on('trackRemoved', (ctx) => {
  const peerId = ctx.peer.id;
  document.getElementById(peerId)?.remove(); // remove video element
});

async function startScreenSharing(webrtc: WebRTCEndpoint) {
  // Get screen sharing MediaStream
  const screenStream = await navigator.mediaDevices.getDisplayMedia(SCREEN_SHARING_MEDIA_CONSTRAINTS);

  // Add local MediaStream to webrtc
  screenStream.getTracks().forEach((track) => webrtc.addTrack(track, { type: 'screen' }));
}
```

## Examples

For more examples, see the [examples](../../examples/ts-client/) folder.

## Copyright and License

Copyright 2024, [Software Mansion](https://swmansion.com/?utm_source=git&utm_medium=readme&utm_campaign=fishjam-ts)

[![Software Mansion](https://logo.swmansion.com/logo?color=white&variant=desktop&width=200&tag=fishjam-github)](https://swmansion.com/?utm_source=git&utm_medium=readme&utm_campaign=fishjam-ts)

Licensed under the [Apache License, Version 2.0](LICENSE)
