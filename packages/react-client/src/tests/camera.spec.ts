import { act } from "@testing-library/react";

import { useCamera } from "../hooks/devices/useCamera";
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
    const { result } = renderHook(() => useCamera());

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.toggleCamera(); // on + publish
    });
    await act(async () => {
      await result.current.toggleCamera(); // off
    });

    expect(result.current.isCameraOn).toBe(false);
    // pauseStreaming replaces with null and flips metadata paused=true.
    expect(client.replaceTrack).toHaveBeenCalledWith(expect.any(String), null);
    const lastMeta = client.updateTrackMetadata.mock.calls.at(-1)?.[1];
    expect(lastMeta).toMatchObject({ type: "camera", paused: true });
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

  it("awaits the in-flight publish so an op racing addTrack targets the remote id", async ({
    media,
    client,
    renderHook,
  }) => {
    media.setUserMediaStream(videoStream());
    // Hold addTrack open: the remote track id won't exist until we flush.
    client.deferAddTracks();
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    // Join → auto-publish fires, but addTrack is suspended. At this point
    // currentTrackIdRef still holds the LOCAL track id and the remote track is
    // not yet registered on the local peer.
    act(() => client.simulateJoined());
    expect(client.addTrack).toHaveBeenCalledTimes(1);

    await act(async () => {
      // toggleCamera-off calls getCurrentTrackId() as its FIRST step, so the id
      // read races the pending publish. getCurrentTrackId() must await
      // connectionPromiseRef: we read the id while addTrack is still suspended,
      // then resolve the publish before letting the toggle continue.
      const toggling = result.current.toggleCamera();
      client.flushAddTracks(); // addTrack resolves → currentTrackIdRef advances to remote-0
      await toggling;
    });

    // Regression guard for the local→remote id race: because getCurrentTrackId
    // awaited the in-flight publish, pauseStreaming targeted the REMOTE id.
    // Without that await it reads the still-local id (whose track isn't
    // registered yet), resolves to null, and skips replaceTrack entirely.
    expect(client.replaceTrack).toHaveBeenCalledTimes(1);
    expect(client.replaceTrack).toHaveBeenCalledWith("remote-0", null);
  });
});
