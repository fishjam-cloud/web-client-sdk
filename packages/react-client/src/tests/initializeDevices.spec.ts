import { act } from "@testing-library/react";

import { useCamera } from "../hooks/devices/useCamera";
import { useInitializeDevices } from "../hooks/devices/useInitializeDevices";
import { createFakeStream } from "./support/fakeMediaStream";
import { describe, expect, it } from "./support/fixtures";

const fullStream = () =>
  createFakeStream([
    { kind: "video", deviceId: "cam-1" },
    { kind: "audio", deviceId: "mic-1" },
  ]);

const devices = [
  { deviceId: "cam-1", kind: "videoinput" as const, label: "Cam 1" },
  { deviceId: "mic-1", kind: "audioinput" as const, label: "Mic 1" },
];

describe("useInitializeDevices", () => {
  it("acquires media and reports initialized", async ({ media, renderHook }) => {
    media.setUserMediaStream(fullStream());
    media.setEnumeratedDevices(devices);

    const { result } = renderHook(() => useInitializeDevices());

    let outcome: Awaited<ReturnType<typeof result.current.initializeDevices>>;
    await act(async () => {
      outcome = await result.current.initializeDevices();
    });

    expect(outcome!.status).toBe("initialized");
    expect(outcome!.stream).not.toBeNull();
    expect(media.devices.enumerateDevices).toHaveBeenCalled();
  });

  it("is idempotent: a second call reports already_initialized", async ({ media, renderHook }) => {
    media.setUserMediaStream(fullStream());
    media.setEnumeratedDevices(devices);

    const { result } = renderHook(() => useInitializeDevices());

    await act(async () => {
      await result.current.initializeDevices();
    });
    let second: Awaited<ReturnType<typeof result.current.initializeDevices>>;
    await act(async () => {
      second = await result.current.initializeDevices();
    });

    expect(second!.status).toBe("already_initialized");
  });

  it("falls back to audio-only when no camera is installed", async ({ media, renderHook }) => {
    // Only a microphone exists: the combined audio+video request fails
    // (NotFoundError, as in a real browser) and the audio-only retry succeeds.
    media.setUserMediaStream(createFakeStream([{ kind: "audio", deviceId: "mic-1" }]));
    media.setEnumeratedDevices([devices[1]]);

    const { result } = renderHook(() => useInitializeDevices());

    let outcome: Awaited<ReturnType<typeof result.current.initializeDevices>>;
    await act(async () => {
      outcome = await result.current.initializeDevices();
    });

    expect(outcome!.status).toBe("initialized_with_errors");
    expect(outcome!.errors?.video).not.toBeNull();
    expect(outcome!.errors?.audio).toBeNull();
  });

  it("populates the device lists exposed by useCamera", async ({ media, renderHook }) => {
    media.setUserMediaStream(fullStream());
    media.setEnumeratedDevices(devices);

    const { result } = renderHook(() => ({
      init: useInitializeDevices(),
      camera: useCamera(),
    }));

    await act(async () => {
      await result.current.init.initializeDevices();
    });

    expect(result.current.camera.cameraDevices).toHaveLength(1);
    expect(result.current.camera.cameraDevices[0]).toMatchObject({ deviceId: "cam-1", label: "Cam 1" });
  });
});
