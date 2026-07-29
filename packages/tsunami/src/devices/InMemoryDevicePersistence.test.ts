import { describe, expect, it } from "vitest";

import { InMemoryDevicePersistence } from "./InMemoryDevicePersistence";

describe("InMemoryDevicePersistence", () => {
  it("stores camera and microphone selections independently", () => {
    const persistence = new InMemoryDevicePersistence();

    expect(persistence.getLastDevice("audio")).toBeNull();
    expect(persistence.getLastDevice("video")).toBeNull();

    persistence.saveLastDevice("audio", {
      deviceId: "microphone-1",
      label: "Built-in microphone",
      kind: "audio",
    });
    persistence.saveLastDevice("video", {
      deviceId: "camera-1",
      label: "Front camera",
      kind: "video",
    });

    expect(persistence.getLastDevice("audio")).toEqual({
      deviceId: "microphone-1",
      label: "Built-in microphone",
      kind: "audio",
    });
    expect(persistence.getLastDevice("video")).toEqual({
      deviceId: "camera-1",
      label: "Front camera",
      kind: "video",
    });
  });

  it("owns stored values instead of exposing mutable references", () => {
    const persistence = new InMemoryDevicePersistence();
    const selectedDevice = { deviceId: "camera-1", label: "Front camera", kind: "video" as const };

    persistence.saveLastDevice("video", selectedDevice);
    selectedDevice.label = "Changed outside persistence";
    const firstRead = persistence.getLastDevice("video");
    if (firstRead) firstRead.label = "Changed returned value";

    expect(persistence.getLastDevice("video")).toEqual({
      deviceId: "camera-1",
      label: "Front camera",
      kind: "video",
    });
  });
});
