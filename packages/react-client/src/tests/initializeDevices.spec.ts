import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useCamera } from "../hooks/devices/useCamera";
import { useInitializeDevices } from "../hooks/devices/useInitializeDevices";
import { createFakeStream } from "./support/fakeMediaStream";
import { renderHookWithProvider } from "./support/renderWithProvider";
import { media } from "./support/setup";

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
  it("acquires media and reports initialized", async () => {
    media().setUserMediaStream(fullStream());
    media().setEnumeratedDevices(devices);

    const { result } = renderHookWithProvider(() => useInitializeDevices());

    let outcome: Awaited<ReturnType<typeof result.current.initializeDevices>>;
    await act(async () => {
      outcome = await result.current.initializeDevices();
    });

    expect(outcome!.status).toBe("initialized");
    expect(outcome!.stream).not.toBeNull();
    expect(media().devices.enumerateDevices).toHaveBeenCalled();
  });

  it("is idempotent: a second call reports already_initialized", async () => {
    media().setUserMediaStream(fullStream());
    media().setEnumeratedDevices(devices);

    const { result } = renderHookWithProvider(() => useInitializeDevices());

    await act(async () => {
      await result.current.initializeDevices();
    });
    let second: Awaited<ReturnType<typeof result.current.initializeDevices>>;
    await act(async () => {
      second = await result.current.initializeDevices();
    });

    expect(second!.status).toBe("already_initialized");
  });

  it("populates the device lists exposed by useCamera", async () => {
    media().setUserMediaStream(fullStream());
    media().setEnumeratedDevices(devices);

    const { result } = renderHookWithProvider(() => ({
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
