[![NPM Version](https://img.shields.io/npm/v/@fishjam-cloud/ts-client)](https://www.npmjs.com/package/@fishjam-cloud/ts-client)
[![TypeScript Strict](https://badgen.net/badge/TS/Strict)](https://www.typescriptlang.org)
[![TypeDoc](https://img.shields.io/badge/TypeDoc-8A2BE2)](https://fishjam-cloud.github.io/web-client-sdk/modules/_fishjam_dev_ts_client.html)

# Fishjam TS Client

TypeScript client library for [Fishjam Cloud](https://fishjam.io).

> [!WARNING]  
> This SDK is not stable yet. We recommend to use
> [React Client](https://github.com/fishjam-cloud/web-client-sdk/tree/main/packages/react-client) for Fishjam Cloud
> services.

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

- Account on [Fishjam Cloud](https://https://fishjam.io) with App configured.
- Created room and token of peer in that room. You can use Room Manager to create room and peer token.

The following code snippet is based on the
[minimal](https://github.com/fishjam-cloud/web-client-sdk/tree/main/examples/ts-client/minimal/) example.

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

const FISHJAM_URL = 'ws://localhost:5002';

// Start the peer connection
client.connect({
  peerMetadata: { name: 'peer' },
  token: peerToken,
  url: FISHJAM_URL,
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

For more examples, see the [examples](https://github.com/fishjam-cloud/web-client-sdk/tree/main/examples/ts-client/)
folder.

## License

Licensed under the [Apache License, Version 2.0](LICENSE)

## Fishjam Cloud is created by Software Mansion

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with experience in building web and mobile
apps. We are Core React Native Contributors and experts in dealing with all kinds of React Native issues. We can help
you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=fishjam&utm_medium=web-readme).

[![Software Mansion](https://logo.swmansion.com/logo?color=white&variant=desktop&width=200&tag=react-client)](https://swmansion.com/contact/projects?utm_source=fishjam&utm_medium=web-readme)
