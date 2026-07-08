import { vi } from "vitest";

import { FakeMediaStream } from "./fakeMediaStream";

/**
 * Controllable fake of the browser media layer. This is the exact surface the
 * rewrite plans to hoist behind an injected `PlatformDeviceManager`, so keeping
 * it isolated here means the same control knobs drive both the current
 * (React-owned) tests and the future ts-client/core tests.
 */
export type FakeMediaDevices = {
  getUserMedia: ReturnType<typeof vi.fn>;
  getDisplayMedia: ReturnType<typeof vi.fn>;
  enumerateDevices: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

export type MediaDevicesController = {
  devices: FakeMediaDevices;
  /** Queue/replace what the next getUserMedia returns, keyed by requested kind. */
  setUserMediaStream: (stream: MediaStream) => void;
  /** Make the next getUserMedia reject with a DOMException of the given name. */
  failUserMediaOnce: (errorName: string) => void;
  failUserMediaAlways: (errorName: string) => void;
  setDisplayMediaStream: (stream: MediaStream) => void;
  failDisplayMediaOnce: (errorName: string) => void;
  setEnumeratedDevices: (devices: Partial<MediaDeviceInfo>[]) => void;
  restore: () => void;
};

const makeError = (name: string) => {
  const err = new Error(name);
  err.name = name;
  return err;
};

export const installFakeMediaDevices = (): MediaDevicesController => {
  let userMediaStreamFactory: () => MediaStream = () => new FakeMediaStream();
  let userMediaError: { name: string; once: boolean } | null = null;
  let displayMediaStreamFactory: () => MediaStream = () => new FakeMediaStream();
  let displayMediaError: string | null = null;
  let enumerated: MediaDeviceInfo[] = [];

  const getUserMedia = vi.fn(async () => {
    if (userMediaError) {
      const name = userMediaError.name;
      if (userMediaError.once) userMediaError = null;
      throw makeError(name);
    }
    return userMediaStreamFactory();
  });

  const getDisplayMedia = vi.fn(async () => {
    if (displayMediaError) {
      const name = displayMediaError;
      displayMediaError = null;
      throw makeError(name);
    }
    return displayMediaStreamFactory();
  });

  const enumerateDevices = vi.fn(async () => enumerated);

  const devices: FakeMediaDevices = {
    getUserMedia,
    getDisplayMedia,
    enumerateDevices,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  // jsdom provides `navigator` but not `navigator.mediaDevices` / `MediaStream`.
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  Object.defineProperty(navigator, "mediaDevices", { value: devices, configurable: true, writable: true });

  const originalMediaStream = (globalThis as { MediaStream?: unknown }).MediaStream;
  (globalThis as { MediaStream?: unknown }).MediaStream = FakeMediaStream;

  return {
    devices,
    setUserMediaStream: (stream) => {
      userMediaError = null;
      userMediaStreamFactory = () => stream;
    },
    failUserMediaOnce: (errorName) => {
      userMediaError = { name: errorName, once: true };
    },
    failUserMediaAlways: (errorName) => {
      userMediaError = { name: errorName, once: false };
    },
    setDisplayMediaStream: (stream) => {
      displayMediaError = null;
      displayMediaStreamFactory = () => stream;
    },
    failDisplayMediaOnce: (errorName) => {
      displayMediaError = errorName;
    },
    setEnumeratedDevices: (list) => {
      enumerated = list.map((d) => {
        const info = {
          deviceId: d.deviceId ?? "",
          kind: d.kind ?? "videoinput",
          label: d.label ?? "",
          groupId: d.groupId ?? "",
        };
        return { ...info, toJSON: () => info } as MediaDeviceInfo;
      });
    },
    restore: () => {
      // jsdom ships no `navigator.mediaDevices`, so `originalMediaDevices` is
      // usually undefined — in that case the fake must be DELETED, not left in
      // place. Leaving it lets the next `install()` capture this test's fake as
      // its "original" and re-install stale fakes (with queued streams / error
      // state) on later restores.
      if (originalMediaDevices) {
        Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
      } else {
        delete (navigator as { mediaDevices?: unknown }).mediaDevices;
      }
      (globalThis as { MediaStream?: unknown }).MediaStream = originalMediaStream;
    },
  };
};
