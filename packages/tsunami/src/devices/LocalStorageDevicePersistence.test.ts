import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalStorageDevicePersistence } from "./LocalStorageDevicePersistence";

function createStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues));
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };

  return { storage, values };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LocalStorageDevicePersistence", () => {
  it("does not require localStorage during construction", () => {
    vi.stubGlobal("localStorage", undefined);

    const persistence = new LocalStorageDevicePersistence();

    expect(() => persistence.getLastDevice("video")).toThrow("LocalStorage API is not available");
  });

  it("uses the existing storage keys and round-trips a selection", () => {
    const { storage, values } = createStorage();
    vi.stubGlobal("localStorage", storage);
    const persistence = new LocalStorageDevicePersistence();

    expect(persistence.getLastDevice("audio")).toBeNull();

    persistence.saveLastDevice("video", { deviceId: "camera-1", label: "Front camera", kind: "video" });

    expect(values.get("last-selected-video-device")).toBe(
      JSON.stringify({ deviceId: "camera-1", label: "Front camera", kind: "video" }),
    );
    expect(persistence.getLastDevice("video")).toEqual({
      deviceId: "camera-1",
      label: "Front camera",
      kind: "video",
    });
    expect(storage.getItem).toHaveBeenCalledWith("last-selected-audio-device");
  });

  it("reads records previously stored by react-client", () => {
    const { storage } = createStorage({
      "last-selected-audio-device": JSON.stringify({
        deviceId: "microphone-1",
        groupId: "group-1",
        kind: "audioinput",
        label: "Built-in microphone",
      }),
    });
    vi.stubGlobal("localStorage", storage);
    const persistence = new LocalStorageDevicePersistence();

    expect(persistence.getLastDevice("audio")).toEqual({
      deviceId: "microphone-1",
      label: "Built-in microphone",
      kind: "audio",
    });
  });

  it("ignores a malformed stored selection", () => {
    const { storage } = createStorage({ "last-selected-video-device": "not-json" });
    vi.stubGlobal("localStorage", storage);
    const persistence = new LocalStorageDevicePersistence();

    expect(persistence.getLastDevice("video")).toBeNull();
  });
});
