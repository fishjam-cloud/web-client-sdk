# S0-A — does a middleware-returned track become `peer.cameraTrack`?

Throwaway spike. Delete the whole folder when the question is answered.

## The question

The plan publishes effects as a **separate pooled track returned from the camera middleware**,
rather than pushing processed pixels into the camera's own native `RTCVideoSource`. That only
works if Fishjam treats the returned track as the camera track. It should:
`getLocalPeerWithTracks` picks `cameraTrack` by `metadata?.type === 'camera'`
(`packages/react-client/src/hooks/usePeers.ts:79`), not by which native source produced the
pixels, and `LocalTrack.replaceTrack` keeps the Fishjam trackId and metadata.

This spike checks that on a real device, before ~40 engineer-days are built on top of it.

## What it does

No camera tap, no worklets, no segmentation. It allocates a surface pool, renders a hue sweep
into it from the JS thread at 30 fps, and hands that track back from `setCameraTrackMiddleware`.
If the plumbing works, the camera image is replaced by a smoothly cycling colour.

## Running it

**Try the simulator first.** This spike imports no camera frames, so it asks only for
`rnwebgpu/native-texture` (the output-surface feature) and not the camera-import features that
force a physical device elsewhere in this project. If the simulator's adapter has it, the whole
thing runs there. If `useSurfaceWebGpuDevice` reports the feature missing, move to a physical
iPhone.

Open the preview screen, tap **S0-A**, join the room, and have a second peer join from the web.

## Pass / fail

| # | Check | Pass |
|---|---|---|
| 1 | Preview self-view | cycling colour, not the camera |
| 2 | `peer.cameraTrack` locally | resolves to the synthetic track, and `VideosGrid` renders it in the camera tile — not as a `customVideoTracks` entry |
| 3 | Remote peer | sees the cycling colour under camera metadata |
| 4 | Toggle off | camera image returns, no crash |
| 5 | Camera off → on with the spike active | colour comes back (this is the re-apply gap the plan's P0 fixes) |
| 6 | Camera switch | colour survives |

Any of 1–3 failing means the fallback architecture applies: push pixels into the camera's own
`RTCVideoSource`, +8–10 days. Record which check failed and how.

## Known sharp edge this also exercises

`useTrackMiddleware` calls `cleanupRef.current` without clearing it
(`packages/react-client/src/hooks/internal/useTrackMiddleware.ts:13`, `:20`), so `onClear` can
fire twice on an off→on cycle. `SyntheticFrameSource.stop()` is idempotent on purpose — if the
pool were disposed twice we would see it here first.
