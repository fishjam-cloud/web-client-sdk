import type { DeviceItem, IDeviceManager, PlatformMediaStream } from "@fishjam-cloud/tsunami";
import { act } from "@testing-library/react";

import { useCamera } from "../hooks/devices/useCamera";
import { useInitializeDevices } from "../hooks/devices/useInitializeDevices";
import { createFakeStream } from "./support/fakeMediaStream";
import { describe, expect, it, vi } from "./support/fixtures";

const fakeDevices: DeviceItem[] = [
  { deviceId: "native-cam", label: "Native Camera", kind: "video" },
  { deviceId: "native-mic", label: "Native Microphone", kind: "audio" },
];

const createFakeDeviceManager = () => {
  const stream = () =>
    createFakeStream([
      { kind: "video", deviceId: "native-cam" },
      { kind: "audio", deviceId: "native-mic" },
    ]);

  return {
    enumerateDevices: vi.fn(async () => fakeDevices),
    getUserMedia: vi.fn(async () => stream() as PlatformMediaStream),
    getDisplayMedia: vi.fn(async () => stream() as PlatformMediaStream),
    onDeviceChange: vi.fn(() => () => {}),
  } satisfies IDeviceManager<PlatformMediaStream>;
};

describe("FishjamProvider deviceManager injection", () => {
  it("routes device acquisition through the injected manager, not the browser globals", async ({
    media,
    renderHook,
  }) => {
    const deviceManager = createFakeDeviceManager();
    const { result } = renderHook(() => ({ init: useInitializeDevices(), camera: useCamera() }), {
      providerProps: { deviceManager },
    });

    await act(async () => {
      await result.current.init.initializeDevices();
    });

    expect(deviceManager.getUserMedia).toHaveBeenCalled();
    expect(deviceManager.enumerateDevices).toHaveBeenCalled();
    expect(media.devices.getUserMedia).not.toHaveBeenCalled();
    expect(media.devices.enumerateDevices).not.toHaveBeenCalled();

    expect(result.current.camera.isCameraOn).toBe(true);
    expect(result.current.camera.cameraDevices).toEqual([fakeDevices[0]]);
  });

  it("ignores persistLastDevice handlers when a manager is injected", async ({ renderHook }) => {
    const deviceManager = createFakeDeviceManager();
    const persistHandlers = { getLastDevice: vi.fn(() => null), saveLastDevice: vi.fn() };

    const { result } = renderHook(() => useInitializeDevices(), {
      providerProps: { deviceManager, persistLastDevice: persistHandlers },
    });

    await act(async () => {
      await result.current.initializeDevices();
    });

    expect(persistHandlers.getLastDevice).not.toHaveBeenCalled();
    expect(persistHandlers.saveLastDevice).not.toHaveBeenCalled();
  });
});
