import { afterEach, describe, expect, it, vi } from "vitest";

import { WebDeviceManager } from "./WebDeviceManager";

type MediaDevicesFake = Pick<
  MediaDevices,
  "addEventListener" | "enumerateDevices" | "getDisplayMedia" | "getUserMedia" | "removeEventListener"
>;

function deviceInfo(deviceId: string, kind: MediaDeviceKind, label: string): MediaDeviceInfo {
  return { deviceId, groupId: "", kind, label, toJSON: () => ({}) };
}

function createMediaDevices() {
  const fake = {
    addEventListener: vi.fn(),
    enumerateDevices: vi.fn<MediaDevices["enumerateDevices"]>().mockResolvedValue([]),
    getDisplayMedia: vi.fn<MediaDevices["getDisplayMedia"]>(),
    getUserMedia: vi.fn<MediaDevices["getUserMedia"]>(),
    removeEventListener: vi.fn(),
  } satisfies MediaDevicesFake;

  return { fake, mediaDevices: fake as unknown as MediaDevices };
}

function useMediaDevices(mediaDevices: MediaDevices): void {
  vi.stubGlobal("navigator", { mediaDevices });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WebDeviceManager", () => {
  it("does not access browser globals until an operation needs them", async () => {
    const { fake, mediaDevices } = createMediaDevices();
    const getMediaDevices = vi.fn(() => mediaDevices);
    const navigator = {};
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, get: getMediaDevices });
    vi.stubGlobal("navigator", navigator);

    const manager = new WebDeviceManager();

    expect(getMediaDevices).not.toHaveBeenCalled();

    await manager.enumerateDevices();

    expect(getMediaDevices).toHaveBeenCalledOnce();
    expect(fake.enumerateDevices).toHaveBeenCalledOnce();
  });

  it("normalizes browser input devices and excludes audio outputs", async () => {
    const { fake, mediaDevices } = createMediaDevices();
    useMediaDevices(mediaDevices);
    fake.enumerateDevices.mockResolvedValue([
      deviceInfo("camera-1", "videoinput", "Front camera"),
      deviceInfo("microphone-1", "audioinput", "Built-in microphone"),
      deviceInfo("speaker-1", "audiooutput", "Built-in speaker"),
    ]);
    const manager = new WebDeviceManager();

    await expect(manager.enumerateDevices()).resolves.toEqual([
      { deviceId: "camera-1", kind: "video", label: "Front camera" },
      { deviceId: "microphone-1", kind: "audio", label: "Built-in microphone" },
    ]);
  });

  it("delegates media acquisition without changing its constraints", async () => {
    const { fake, mediaDevices } = createMediaDevices();
    useMediaDevices(mediaDevices);
    const userStream = {} as MediaStream;
    const displayStream = {} as MediaStream;
    const userConstraints = Object.freeze({
      audio: true,
      video: Object.freeze({ deviceId: Object.freeze({ exact: "camera-1" }) }),
    });
    const displayOptions = Object.freeze({ video: true });
    fake.getUserMedia.mockResolvedValue(userStream);
    fake.getDisplayMedia.mockResolvedValue(displayStream);
    const manager = new WebDeviceManager();

    await expect(manager.getUserMedia(userConstraints)).resolves.toBe(userStream);
    await expect(manager.getDisplayMedia(displayOptions)).resolves.toBe(displayStream);

    expect(fake.getUserMedia).toHaveBeenCalledWith(userConstraints);
    expect(fake.getDisplayMedia).toHaveBeenCalledWith(displayOptions);
    expect(userConstraints.video.deviceId).toEqual({ exact: "camera-1" });
  });

  it("rejects media acquisition when the browser API is unavailable", async () => {
    vi.stubGlobal("navigator", undefined);
    const manager = new WebDeviceManager();

    await expect(manager.getUserMedia({ audio: true })).rejects.toThrow("MediaDevices API is not available");
    await expect(manager.getDisplayMedia({ video: true })).rejects.toThrow("MediaDevices API is not available");
  });

  it("removes a device-change listener exactly once", () => {
    const { fake, mediaDevices } = createMediaDevices();
    useMediaDevices(mediaDevices);
    const callback = vi.fn();
    const manager = new WebDeviceManager();

    const cleanup = manager.onDeviceChange(callback);
    const listener = fake.addEventListener.mock.calls[0][1] as EventListener;
    listener(new Event("devicechange"));
    cleanup();
    cleanup();

    expect(callback).toHaveBeenCalledOnce();
    expect(fake.addEventListener).toHaveBeenCalledWith("devicechange", listener);
    expect(fake.removeEventListener).toHaveBeenCalledOnce();
    expect(fake.removeEventListener).toHaveBeenCalledWith("devicechange", listener);
  });
});
