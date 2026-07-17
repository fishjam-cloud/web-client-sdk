import { vi } from "vitest";

import { createFakeTrack, FakeMediaStream } from "./fakeMediaStream";

/**
 * Controllable fake of the browser media layer. This is the exact surface the
 * rewrite plans to hoist behind an injected `IDeviceManager`, so keeping it
 * isolated here (no react-client imports) means the same control knobs drive
 * both the current (React-owned) tests and the future core tests.
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
  /**
   * Declare the tracks the "installed" devices produce. Each getUserMedia call
   * hands out FRESH live tracks cut down to the requested kinds (an audio-only
   * request never receives video), so a stop→restart sequence gets live tracks
   * again instead of the previous call's ended ones.
   */
  setUserMediaStream: (stream: MediaStream) => void;
  /** Make every getUserMedia reject with a DOMException of the given name. */
  failUserMediaAlways: (errorName: string) => void;
  setDisplayMediaStream: (stream: MediaStream) => void;
  setEnumeratedDevices: (devices: Partial<MediaDeviceInfo>[]) => void;
  restore: () => void;
};

const makeError = (name: string) => {
  const err = new Error(name);
  err.name = name;
  return err;
};

// Real browsers report which constraint could not be satisfied.
const makeOverconstrainedError = () => {
  const err = makeError("OverconstrainedError") as Error & { constraint: string };
  err.constraint = "deviceId";
  return err;
};

type TrackKind = "audio" | "video";

/** A device the fake has "installed", derived from the staged template tracks. */
type InstalledDevice = { kind: TrackKind; deviceId: string; label: string };

/** `deviceId: { exact }` is mandatory; a plain string or `{ ideal }` is a preference. */
const requestedDeviceId = (constraint: MediaTrackConstraints): { id: string; mandatory: boolean } | null => {
  const deviceId = constraint.deviceId;
  if (typeof deviceId === "string") return { id: deviceId, mandatory: false };
  if (deviceId && typeof deviceId === "object" && !Array.isArray(deviceId)) {
    if (typeof deviceId.exact === "string") return { id: deviceId.exact, mandatory: true };
    if (typeof deviceId.ideal === "string") return { id: deviceId.ideal, mandatory: false };
  }
  return null;
};

/**
 * Resolve one kind's constraint against the installed devices, mirroring real
 * getUserMedia semantics: unmatched `exact` deviceId → OverconstrainedError,
 * no device of the kind at all → NotFoundError, otherwise a fresh live track.
 * Pure constraint logic — safe to lift into a future IDeviceManager fake.
 */
const resolveTrack = (installed: InstalledDevice[], kind: TrackKind, constraint: MediaTrackConstraints | boolean) => {
  const candidates = installed.filter((device) => device.kind === kind);
  const requested = typeof constraint === "object" ? requestedDeviceId(constraint) : null;

  let device: InstalledDevice | undefined;
  if (requested?.mandatory) {
    device = candidates.find((candidate) => candidate.deviceId === requested.id);
    if (!device) throw makeOverconstrainedError();
  } else {
    device = (requested && candidates.find((candidate) => candidate.deviceId === requested.id)) || candidates[0];
    if (!device) throw makeError("NotFoundError");
  }

  return createFakeTrack({ kind, deviceId: device.deviceId, label: device.label });
};

export const installFakeMediaDevices = (): MediaDevicesController => {
  let userMediaTemplate: MediaStream = new FakeMediaStream();
  let userMediaError: string | null = null;
  let displayMediaStreamFactory: () => MediaStream = () => new FakeMediaStream();
  let enumerated: MediaDeviceInfo[] = [];

  // Installed devices = the staged template tracks, plus enumerated devices
  // not already covered by them (so a test can select any enumerated device).
  const installedDevices = (): InstalledDevice[] => {
    const fromTemplate = userMediaTemplate.getTracks().map(
      (track): InstalledDevice => ({
        kind: track.kind as TrackKind,
        deviceId: track.getSettings().deviceId ?? "",
        label: track.label,
      }),
    );
    const fromEnumerated = enumerated
      .filter((device) => device.kind === "videoinput" || device.kind === "audioinput")
      .map(
        (device): InstalledDevice => ({
          kind: device.kind === "videoinput" ? "video" : "audio",
          deviceId: device.deviceId,
          label: device.label,
        }),
      )
      .filter((device) => !fromTemplate.some((t) => t.kind === device.kind && t.deviceId === device.deviceId));
    return [...fromTemplate, ...fromEnumerated];
  };

  const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints = {}) => {
    if (userMediaError) throw makeError(userMediaError);

    const installed = installedDevices();
    const tracks = (["audio", "video"] as const)
      .filter((kind) => Boolean(constraints[kind]))
      .map((kind) => resolveTrack(installed, kind, constraints[kind]!));
    return new FakeMediaStream(tracks);
  });

  const getDisplayMedia = vi.fn(async () => displayMediaStreamFactory());

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
      userMediaTemplate = stream;
    },
    failUserMediaAlways: (errorName) => {
      userMediaError = errorName;
    },
    setDisplayMediaStream: (stream) => {
      displayMediaStreamFactory = () => stream;
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
