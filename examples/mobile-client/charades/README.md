# Charades

A drawing-charades video game built on Fishjam: the host draws in the air with a pinch gesture in
front of the camera; viewers watch the composited drawing over the host's video and guess out
loud.

Under the hood, this app is the flagship demo of
[`@fishjam-cloud/react-native-vision-camera-source`](../../../packages/react-native-vision-camera-source)'s
WebGPU tier:

- The host's camera runs through VisionCamera and `useVisionCameraWebGpuSource` — every frame is
  composited on the GPU (camera passthrough + persistent stroke overlay + cursor ring, written
  with TypeGPU) and published to the room as the host's camera track. No pixel copies anywhere.
- Hand tracking (MediaPipe hand models exported to ExecuTorch, `assets/models/*.pte`) runs in the
  same frame worklet and drives the brush from the pinch gesture.
- Viewers run on-device speech recognition (`charades/game/speech/`) to auto-detect correct
  guesses.

## Setup

```bash
RNET_NO_X86_64=1 yarn   # in the repo root
cp .env.example .env    # fill in EXPO_PUBLIC_FISHJAM_ID and EXPO_PUBLIC_SANDBOX_API_URL
```

`RNET_NO_X86_64=1` skips the Android x86_64 (emulator) ExecuTorch libs — the vendored v0.0.0
release publishes no asset for that ABI, so a plain install fails while fetching it.

> [!IMPORTANT]
> **react-native-executorch (rne-rewrite build):** this app consumes a local tarball of the
> react-native-executorch rewrite (`vendor/react-native-executorch-0.0.0.tgz`) for the hand
> tracking and the viewer-side Whisper guess detection. The repo-root `patches/` (applied by
> `patch-package` on install) carry the required react-native-worklets and executorch fixes.

## Run

```bash
yarn ios       # or: yarn android
```

Camera + GPU behavior needs a **physical device** — the iOS Simulator cannot import the camera's
YUV textures. Join as the host on the device with the camera; join as a viewer from a second
client to watch and guess.
