[![NPM Version](https://img.shields.io/npm/v/@fishjam-cloud/ts-client)](https://www.npmjs.com/package/@fishjam-cloud/ts-client)

# @fishjam-cloud/ts-client

Framework-agnostic TypeScript client for [Fishjam](https://fishjam.io), Software Mansion's real-time video and audio
streaming service. It connects a browser peer to a Fishjam room, publishes local tracks and emits events for other
peers' tracks.

> [!TIP]  
> Building a React app? Use [`@fishjam-cloud/react-client`](https://www.npmjs.com/package/@fishjam-cloud/react-client).
> It is built on this package and handles device management and state for you.

## Installation

```bash
npm install @fishjam-cloud/ts-client
```

## Quick start

```ts
import { FishjamClient } from '@fishjam-cloud/ts-client';

const FISHJAM_ID = 'YOUR_FISHJAM_ID'; // from the Fishjam dashboard: https://fishjam.io/app
const peerToken = 'PEER_TOKEN'; // get it from your backend, or from the Sandbox API while testing

const client = new FishjamClient();

// Register listeners before connecting, so you also get the tracks of peers already in the room
client.on('trackReady', (ctx) => {
  if (!ctx.track) return;

  const element = document.createElement(ctx.track.kind === 'video' ? 'video' : 'audio');
  element.id = ctx.trackId;
  element.autoplay = true;
  element.srcObject = new MediaStream([ctx.track]);
  document.body.appendChild(element);
});

client.on('trackRemoved', (ctx) => {
  document.getElementById(ctx.trackId)?.remove();
});

await client.connect({
  url: `wss://fishjam.io/api/v1/connect/${FISHJAM_ID}`,
  token: peerToken,
  peerMetadata: {},
});

// Publish your camera and microphone
const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

for (const track of localStream.getTracks()) {
  await client.addTrack(track, {
    type: track.kind === 'video' ? 'camera' : 'microphone',
    paused: false,
  });
}
```

The [TypeScript quick start](https://fishjam.swmansion.com/docs/tutorials/typescript-quick-start) explains each step and
how to get a peer token.

## Documentation

- [TypeScript quick start](https://fishjam.swmansion.com/docs/tutorials/typescript-quick-start)
- [API reference](https://fishjam.swmansion.com/docs/api/web)
- [Documentation home](https://fishjam.swmansion.com/docs)

## License

Licensed under the [Apache License, Version 2.0](https://github.com/fishjam-cloud/web-client-sdk/blob/main/LICENSE).

## Fishjam is created by Software Mansion

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with experience in building web and mobile
apps. We are Core React Native Contributors and experts in dealing with all kinds of React Native issues. We can help
you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=fishjam&utm_medium=web-readme).

[![Software Mansion](https://logo.swmansion.com/logo?color=white&variant=desktop&width=200&tag=react-client)](https://swmansion.com/contact/projects?utm_source=fishjam&utm_medium=web-readme)
