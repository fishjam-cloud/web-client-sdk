import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCamera } from "../hooks/devices/useCamera";
import { FakeFishjamClient } from "./support/fakeFishjamClient";
import { createFakeStream } from "./support/fakeMediaStream";
import { renderHookWithProvider } from "./support/renderWithProvider";
import { media } from "./support/setup";

const videoStream = () => createFakeStream([{ kind: "video", deviceId: "cam-1" }]);

describe("useCamera", () => {
  it("is off before the device is started", () => {
    const { result } = renderHookWithProvider(() => useCamera());
    expect(result.current.isCameraOn).toBe(false);
    expect(result.current.cameraStream).toBeNull();
  });

  it("startCamera acquires the device and exposes the stream without publishing", async () => {
    media().setUserMediaStream(videoStream());
    const { result, client } = renderHookWithProvider(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(media().devices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.isCameraOn).toBe(true);
    expect(result.current.cameraStream?.getVideoTracks()).toHaveLength(1);
    // Not connected → no track published to the SFU.
    expect(client.addTrack).not.toHaveBeenCalled();
  });

  it("stopCamera tears the stream down", async () => {
    media().setUserMediaStream(videoStream());
    const { result } = renderHookWithProvider(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });
    act(() => result.current.stopCamera());

    expect(result.current.isCameraOn).toBe(false);
    expect(result.current.cameraStream).toBeNull();
  });

  it("toggleCamera while connected publishes a camera track with metadata", async () => {
    media().setUserMediaStream(videoStream());
    const client = new FakeFishjamClient();
    const { result } = renderHookWithProvider(() => useCamera(), { client });

    act(() => client.simulateJoined()); // peerStatus → connected

    await act(async () => {
      await result.current.toggleCamera();
    });

    expect(result.current.isCameraOn).toBe(true);
    expect(client.addTrack).toHaveBeenCalledTimes(1);
    const meta = client.addTrack.mock.calls[0][1];
    expect(meta).toMatchObject({ type: "camera", paused: false });
  });

  it("auto-publishes the running device when the room is joined", async () => {
    media().setUserMediaStream(videoStream());
    const client = new FakeFishjamClient();
    const { result } = renderHookWithProvider(() => useCamera(), { client });

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

  it("toggleCamera off while connected pauses the published track", async () => {
    media().setUserMediaStream(videoStream());
    const client = new FakeFishjamClient();
    const { result } = renderHookWithProvider(() => useCamera(), { client });

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

  it("setCameraTrackMiddleware applies the middleware to the device track", async () => {
    media().setUserMediaStream(videoStream());
    const { result } = renderHookWithProvider(() => useCamera());

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

  it("surfaces a device error when getUserMedia is denied", async () => {
    media().failUserMediaAlways("NotAllowedError");
    const { result } = renderHookWithProvider(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.cameraDeviceError).toEqual({ name: "NotAllowedError" });
    expect(result.current.isCameraOn).toBe(false);
  });
});
