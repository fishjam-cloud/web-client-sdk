import { FakeDeviceManager, FakeMediaStream } from "@fishjam-cloud/tsunami/testing";
import { vi } from "vitest";

export type FakeMediaDevices = {
  getUserMedia: ReturnType<typeof vi.fn>;
  getDisplayMedia: ReturnType<typeof vi.fn>;
  enumerateDevices: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

export type MediaDevicesController = {
  devices: FakeMediaDevices;
  setUserMediaStream: (stream: MediaStream) => void;
  failUserMediaAlways: (errorName: string) => void;
  setDisplayMediaStream: (stream: MediaStream) => void;
  setEnumeratedDevices: (devices: Partial<MediaDeviceInfo>[]) => void;
  restore: () => void;
};

const makeError = (name: string) => {
  const error = new Error(name);
  error.name = name;
  return error;
};

/**
 * Temporary adapter for the React tests, whose production code still reads
 * navigator.mediaDevices. Constraint behavior comes from tsunami's shared
 * FakeDeviceManager; this browser-global wrapper can disappear after migration.
 */
export const installFakeMediaDevices = (): MediaDevicesController => {
  const manager = new FakeDeviceManager();
  let enumerated: MediaDeviceInfo[] = [];

  const devices: FakeMediaDevices = {
    getUserMedia: manager.getUserMedia,
    getDisplayMedia: manager.getDisplayMedia,
    enumerateDevices: vi.fn(async () => enumerated),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  Object.defineProperty(navigator, "mediaDevices", { value: devices, configurable: true, writable: true });

  const originalMediaStream = (globalThis as { MediaStream?: unknown }).MediaStream;
  (globalThis as { MediaStream?: unknown }).MediaStream = FakeMediaStream;

  return {
    devices,
    setUserMediaStream: (stream) => manager.setUserMediaStream(stream),
    failUserMediaAlways: (errorName) => manager.failUserMediaAlways(makeError(errorName)),
    setDisplayMediaStream: (stream) => manager.setDisplayMediaStream(stream),
    setEnumeratedDevices: (list) => {
      enumerated = list.map((device) => {
        const info = {
          deviceId: device.deviceId ?? "",
          kind: device.kind ?? "videoinput",
          label: device.label ?? "",
          groupId: device.groupId ?? "",
        };
        return { ...info, toJSON: () => info } as MediaDeviceInfo;
      });
      manager.setDevices(
        enumerated
          .filter((device) => device.kind === "videoinput" || device.kind === "audioinput")
          .map((device) => ({
            deviceId: device.deviceId,
            label: device.label,
            kind: device.kind === "videoinput" ? "video" : "audio",
          })),
      );
    },
    restore: () => {
      if (originalMediaDevices) {
        Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
      } else {
        delete (navigator as { mediaDevices?: unknown }).mediaDevices;
      }
      (globalThis as { MediaStream?: unknown }).MediaStream = originalMediaStream;
    },
  };
};
