import { describe, expect, it, vi } from "vitest";

import { FakeDeviceManager } from "./FakeDeviceManager";
import { createFakeStream } from "./FakeMediaStream";

describe("FakeDeviceManager", () => {
  it("filters requested kinds and returns fresh live tracks for every acquisition", async () => {
    const manager = new FakeDeviceManager();
    manager.setUserMediaStream(
      createFakeStream([
        { kind: "audio", deviceId: "microphone-1", label: "Microphone" },
        { kind: "video", deviceId: "camera-1", label: "Camera" },
      ]),
    );

    const first = await manager.getUserMedia({ audio: true });
    first.getAudioTracks()[0].stop();
    const second = await manager.getUserMedia({ audio: true });

    expect(first.getVideoTracks()).toEqual([]);
    expect(second.getVideoTracks()).toEqual([]);
    expect(second.getAudioTracks()[0]).not.toBe(first.getAudioTracks()[0]);
    expect(second.getAudioTracks()[0].readyState).toBe("live");
    expect(second.getAudioTracks()[0].getSettings().deviceId).toBe("microphone-1");
  });

  it("honors an exact deviceId and rejects when it cannot be satisfied", async () => {
    const manager = new FakeDeviceManager({
      devices: [
        { kind: "video", deviceId: "camera-1", label: "Front camera" },
        { kind: "video", deviceId: "camera-2", label: "Back camera" },
      ],
    });

    const stream = await manager.getUserMedia({ video: { deviceId: { exact: "camera-2" } } });
    const rejection = manager.getUserMedia({ video: { deviceId: { exact: "missing" } } });

    expect(stream.getVideoTracks()[0].getSettings().deviceId).toBe("camera-2");
    await expect(rejection).rejects.toMatchObject({ name: "OverconstrainedError", constraint: "deviceId" });
  });

  it("rejects when no installed device provides a requested kind", async () => {
    const manager = new FakeDeviceManager({
      devices: [{ kind: "video", deviceId: "camera-1", label: "Camera" }],
    });

    await expect(manager.getUserMedia({ audio: true })).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("notifies active device-change listeners and honors idempotent cleanup", () => {
    const manager = new FakeDeviceManager();
    const callback = vi.fn();
    const cleanup = manager.onDeviceChange(callback);

    manager.simulateDeviceChange();
    cleanup();
    cleanup();
    manager.simulateDeviceChange();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
