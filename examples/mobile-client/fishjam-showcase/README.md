# Fishjam Showcase (React Native)

Expo app that demonstrates Fishjam SDK features together in one project.

## Tabs

- **Room** – Conference flow: staging/production Fishjam ID, join preview (optional camera track middleware), then in-room toolbar with video grid, VAD highlights, data-channel chat, peer metadata edit, reconnection banner, debug overlay, screen share, CallKit, foreground service, and PiP (`startPIP` / `stopPIP` via a hidden host `RTCView`).
- **Livestream** – Viewer, camera/mic streamer, and screen-sharing streamer (each uses the Fishjam ID you enter).
- **Settings** – `FishjamProvider` options: debug logs, reconnection on/off and max attempts, optional max video bitrate (kbps). Saving remounts the SDK client.

## Setup

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_FISHJAM_ID`. For staging rooms, set `EXPO_PUBLIC_VIDEOROOM_STAGING_SANDBOX_URL` as in other mobile examples.

From repo root:

```bash
yarn install
cd examples/mobile-client/fishjam-showcase
yarn start
```

## Workspace

This package is part of the monorepo and depends on `@fishjam-cloud/react-native-client` via `workspace:*`.
