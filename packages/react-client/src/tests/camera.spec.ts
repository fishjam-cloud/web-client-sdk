import { act } from "@testing-library/react";

import { useCamera } from "../hooks/devices/useCamera";
import { usePeers } from "../hooks/usePeers";
import { createFakeStream } from "./support/fakeMediaStream";
import { describe, expect, it, vi } from "./support/fixtures";

const videoStream = () => createFakeStream([{ kind: "video", deviceId: "cam-1" }]);

describe("useCamera", () => {
  it("is off before the device is started", ({ renderHook }) => {
    const { result } = renderHook(() => useCamera());
    expect(result.current.isCameraOn).toBe(false);
    expect(result.current.cameraStream).toBeNull();
  });

  it("startCamera acquires the device and exposes the stream without publishing", async ({
    media,
    client,
    renderHook,
  }) => {
    media.setUserMediaStream(videoStream());
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(media.devices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.isCameraOn).toBe(true);
    expect(result.current.cameraStream?.getVideoTracks()).toHaveLength(1);
    // Not connected → no track published to the SFU.
    expect(client.addTrack).not.toHaveBeenCalled();
  });

  it("stopCamera tears the stream down", async ({ media, renderHook }) => {
    media.setUserMediaStream(videoStream());
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });
    act(() => result.current.stopCamera());

    expect(result.current.isCameraOn).toBe(false);
    expect(result.current.cameraStream).toBeNull();
  });

  it("restarting after stopCamera acquires a live track, not the stopped one", async ({ media, renderHook }) => {
    media.setUserMediaStream(videoStream());
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });
    act(() => result.current.stopCamera());
    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.isCameraOn).toBe(true);
    expect(result.current.cameraStream?.getVideoTracks()[0]?.readyState).toBe("live");
  });

  it("selecting a camera that does not exist surfaces OverconstrainedError", async ({ media, renderHook }) => {
    media.setUserMediaStream(videoStream());
    // KNOWN QUIRK: getDeviceStream (useDeviceManager.ts) MUTATES the constraints
    // object it is handed, baking `deviceId: { exact: ... }` into it — and the
    // default is the module-level VIDEO_TRACK_CONSTRAINTS shared by every
    // FishjamProvider, so without per-test constraints this test would poison
    // every later getUserMedia call in the process with the nonexistent device.
    const { result } = renderHook(() => useCamera(), {
      providerProps: { constraints: { video: {}, audio: true } },
    });

    await act(async () => {
      await result.current.startCamera();
    });
    await act(async () => {
      await result.current.selectCamera("nonexistent-device");
    });

    expect(result.current.cameraDeviceError).toEqual({ name: "OverconstrainedError" });
  });

  it("toggleCamera while connected publishes a camera track with metadata", async ({ media, client, renderHook }) => {
    media.setUserMediaStream(videoStream());
    const { result } = renderHook(() => useCamera());

    act(() => client.simulateJoined()); // peerStatus → connected

    await act(async () => {
      await result.current.toggleCamera();
    });

    expect(result.current.isCameraOn).toBe(true);
    expect(client.addTrack).toHaveBeenCalledTimes(1);
    const meta = client.addTrack.mock.calls[0][1];
    expect(meta).toMatchObject({ type: "camera", paused: false });
  });

  it("auto-publishes the running device when the room is joined", async ({ media, client, renderHook }) => {
    media.setUserMediaStream(videoStream());
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });
    expect(client.addTrack).not.toHaveBeenCalled();

    await act(async () => {
      client.simulateJoined();
    });

    expect(client.addTrack).toHaveBeenCalledTimes(1);
    expect(client.addTrack.mock.calls[0][1]).toMatchObject({ type: "camera" });
  });

  it("toggleCamera off while connected pauses the published track", async ({ media, client, renderHook }) => {
    media.setUserMediaStream(videoStream());
    const { result } = renderHook(() => ({ camera: useCamera(), peers: usePeers() }));

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.camera.toggleCamera(); // on + publish
    });
    await act(async () => {
      await result.current.camera.toggleCamera(); // off
    });

    expect(result.current.camera.isCameraOn).toBe(false);
    // The published track is paused, not removed: no media flows, metadata says paused.
    const published = result.current.peers.localPeer?.cameraTrack;
    expect(published?.track).toBeNull();
    expect(published?.metadata).toMatchObject({ type: "camera", paused: true });
  });

  it("setCameraTrackMiddleware applies the middleware to the device track", async ({ media, renderHook }) => {
    media.setUserMediaStream(videoStream());
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    const processed = createFakeStream([{ kind: "video", deviceId: "processed" }]).getVideoTracks()[0];
    const onClear = vi.fn();
    await act(async () => {
      await result.current.setCameraTrackMiddleware((_track) => ({ track: processed, onClear }));
    });

    expect(result.current.currentCameraMiddleware).toBeTypeOf("function");
    expect(result.current.cameraStream?.getVideoTracks()[0]).toBe(processed);
  });

  it("surfaces a device error when getUserMedia is denied", async ({ media, renderHook }) => {
    media.failUserMediaAlways("NotAllowedError");
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.cameraDeviceError).toEqual({ name: "NotAllowedError" });
    expect(result.current.isCameraOn).toBe(false);
  });

  it("keeps the camera running locally when an audio-only room refuses the video track", async ({
    media,
    client,
    renderHook,
  }) => {
    media.setUserMediaStream(videoStream());
    client.simulateAudioOnlyRoom();
    const { result } = renderHook(() => ({ camera: useCamera(), peers: usePeers() }));

    await act(async () => {
      await result.current.camera.startCamera();
    });
    // Joining triggers the auto-publish, which the audio-only room rejects
    // with TrackTypeError. The hook must swallow it, not crash the tree.
    await act(async () => {
      client.simulateJoined();
    });

    expect(client.addTrack).toHaveBeenCalledTimes(1);
    expect(result.current.camera.isCameraOn).toBe(true); // device still on locally
    expect(result.current.peers.localPeer?.cameraTrack).toBeUndefined(); // nothing published
  });

  it("toggling off while the publish is still in flight pauses the published track", async ({
    media,
    client,
    renderHook,
  }) => {
    media.setUserMediaStream(videoStream());
    // Hold addTrack open so the toggle below races the pending publish.
    client.deferAddTracks();
    const { result } = renderHook(() => ({ camera: useCamera(), peers: usePeers() }));

    await act(async () => {
      await result.current.camera.startCamera();
    });

    // Join → auto-publish fires, but the publish hasn't completed yet.
    act(() => client.simulateJoined());
    expect(client.addTrack).toHaveBeenCalledTimes(1);

    await act(async () => {
      // Toggle off while the publish is pending; the publish completes mid-toggle.
      const toggling = result.current.camera.toggleCamera();
      client.flushAddTracks();
      await toggling;
    });

    // Regression guard: the toggle-off must land on the track that finished
    // publishing — peers end up seeing a paused camera track with no media,
    // not a still-live one the toggle failed to reach.
    expect(result.current.camera.isCameraOn).toBe(false);
    const published = result.current.peers.localPeer?.cameraTrack;
    expect(published?.track).toBeNull();
    expect(published?.metadata).toMatchObject({ type: "camera", paused: true });
  });
});
