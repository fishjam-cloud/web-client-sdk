<img src="https://raw.githubusercontent.com/fishjam-cloud/web-client-sdk/main/.github/images/fishjam-card.png" width="100%" />

# @fishjam-cloud/react-native-client

React Native SDK for [Fishjam](https://fishjam.io), Software Mansion's real-time video and audio streaming
service. Use it to add video conferencing, audio rooms, livestreaming or VoIP calls to an iOS or Android app.

It includes:

- `FishjamProvider` and React hooks to join a room, publish your camera, microphone or screen, and receive
  other peers' tracks
- `RTCView` to render video
- An Expo config plugin that sets up the permissions and native configuration for you
- Optional features: Picture-in-Picture, background streaming, CallKit and VoIP calls, camera effects
  (track middleware) and custom video sources

## Installation

```bash
npx expo install @fishjam-cloud/react-native-client
```

The SDK contains native code, so it does not run in Expo Go. Use a
[development build](https://docs.expo.dev/develop/development-builds/introduction/) or a bare React Native app.
See [Installation](https://fishjam.swmansion.com/docs/how-to/client/installation) for the config plugin and the
camera and microphone permissions.

## Quick start

Wrap your app in `FishjamProvider` with your Fishjam ID from the [Fishjam dashboard](https://fishjam.io/app):

```tsx
import { FishjamProvider } from '@fishjam-cloud/react-native-client';

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
import { Button } from 'react-native';
import { useConnection, useInitializeDevices, useSandbox } from '@fishjam-cloud/react-native-client';

export function JoinRoomButton() {
  const { joinRoom } = useConnection();
  const { initializeDevices } = useInitializeDevices();
  const { getSandboxPeerToken } = useSandbox({ sandboxApiUrl: 'YOUR_SANDBOX_API_URL' });

  const handleJoinRoom = async () => {
    // The Sandbox API is for testing only. In production, get the peer token from your own backend.
    const peerToken = await getSandboxPeerToken('testRoom', 'testUser');

    await initializeDevices();
    await joinRoom({ peerToken });
  };

  return <Button title="Join Room" onPress={handleJoinRoom} />;
}
```

The [React Native quick start](https://fishjam.swmansion.com/docs/tutorials/react-native-quick-start) continues
from here: it shows how to display your own video and other peers.

## Documentation

- [React Native quick start](https://fishjam.swmansion.com/docs/tutorials/react-native-quick-start)
- [Installation](https://fishjam.swmansion.com/docs/how-to/client/installation)
- [VoIP calls](https://fishjam.swmansion.com/docs/how-to/client/voip-calls), including the Android Firebase setup
- [API reference](https://fishjam.swmansion.com/docs/api/mobile)
- [Documentation home](https://fishjam.swmansion.com/docs)

## Examples

- [React Native example app](https://fishjam.swmansion.com/docs/examples/react-native)
- [`fishjam-chat`](https://github.com/fishjam-cloud/web-client-sdk/tree/main/examples/mobile-client/fishjam-chat),
  a conferencing and livestreaming example app

## Related packages

- [`@fishjam-cloud/react-native-webrtc`](https://www.npmjs.com/package/@fishjam-cloud/react-native-webrtc): the
  WebRTC implementation this SDK uses. It is installed as a dependency.
- [`@fishjam-cloud/ios-expo-voip`](https://www.npmjs.com/package/@fishjam-cloud/ios-expo-voip): required on Expo
  for incoming VoIP calls on iOS.
- [`@fishjam-cloud/react-native-custom-video-source`](https://www.npmjs.com/package/@fishjam-cloud/react-native-custom-video-source)
  and [`@fishjam-cloud/react-native-vision-camera-source`](https://www.npmjs.com/package/@fishjam-cloud/react-native-vision-camera-source):
  publish your own video frames.

## License

Licensed under the [Apache License, Version 2.0](https://github.com/fishjam-cloud/web-client-sdk/blob/main/LICENSE).

## Fishjam is created by Software Mansion

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with experience in building web and mobile
apps. We are Core React Native Contributors and experts in dealing with all kinds of React Native issues. We can help
you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=fishjam&utm_medium=web-readme).

[![Software Mansion](https://logo.swmansion.com/logo?color=white&variant=desktop&width=200&tag=react-client)](https://swmansion.com/contact/projects?utm_source=fishjam&utm_medium=web-readme)
