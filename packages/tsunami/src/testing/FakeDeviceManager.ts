import { vi } from "vitest";

import type { DeviceItem, IDeviceManager, IDevicePersistence } from "../devices/deviceManager";
import { createFakeTrack, FakeMediaStream } from "./FakeMediaStream";

type TrackKind = "audio" | "video";
type InstalledDevice = DeviceItem;

export type FakeDeviceManagerOptions = {
  devices?: DeviceItem[];
  persistence?: IDevicePersistence;
};

const namedError = (name: "NotFoundError" | "OverconstrainedError") => {
  const error = new Error(name) as Error & { constraint?: string };
  error.name = name;
  if (name === "OverconstrainedError") error.constraint = "deviceId";
  return error;
};

const requestedDeviceIds = (constraint: MediaTrackConstraints): { ids: string[]; mandatory: boolean } | null => {
  const deviceId = constraint.deviceId;
  if (typeof deviceId === "string") return { ids: [deviceId], mandatory: false };
  if (Array.isArray(deviceId)) return { ids: deviceId, mandatory: false };
  if (deviceId && typeof deviceId === "object") {
    if (deviceId.exact !== undefined) {
      return { ids: Array.isArray(deviceId.exact) ? deviceId.exact : [deviceId.exact], mandatory: true };
    }
    if (deviceId.ideal !== undefined) {
      return { ids: Array.isArray(deviceId.ideal) ? deviceId.ideal : [deviceId.ideal], mandatory: false };
    }
  }
  return null;
};

const resolveTrack = (devices: InstalledDevice[], kind: TrackKind, constraint: MediaTrackConstraints | boolean) => {
  const candidates = devices.filter((device) => device.kind === kind);
  const requested = typeof constraint === "object" ? requestedDeviceIds(constraint) : null;
  const requestedDevice = requested
    ? candidates.find((candidate) => requested.ids.includes(candidate.deviceId))
    : undefined;

  if (requested?.mandatory && !requestedDevice) throw namedError("OverconstrainedError");

  const device = requestedDevice ?? candidates[0];
  if (!device) throw namedError("NotFoundError");

  return createFakeTrack({ kind, deviceId: device.deviceId, label: device.label });
};

/**
 * Hardware-free IDeviceManager test double.
 *
 * It resolves media constraints like a browser and creates new live tracks for
 * every acquisition, so stopping one returned stream cannot poison a later one.
 */
export class FakeDeviceManager implements IDeviceManager<MediaStream> {
  readonly persistence?: IDevicePersistence;

  private devices: DeviceItem[];
  private userMediaTemplate: MediaStream = new FakeMediaStream();
  private userMediaError: unknown | null = null;
  private displayMediaFactory: () => MediaStream = () => new FakeMediaStream();
  private deviceChangeListeners = new Set<() => void>();

  constructor(options: FakeDeviceManagerOptions = {}) {
    this.devices = [...(options.devices ?? [])];
    this.persistence = options.persistence;
  }

  enumerateDevices = vi.fn(async (): Promise<DeviceItem[]> => this.devices.map((device) => ({ ...device })));

  getUserMedia = vi.fn(async (constraints: MediaStreamConstraints = {}): Promise<MediaStream> => {
    if (this.userMediaError !== null) throw this.userMediaError;

    const installed = this.installedDevices();
    const tracks = (["audio", "video"] as const)
      .filter((kind) => Boolean(constraints[kind]))
      .map((kind) => resolveTrack(installed, kind, constraints[kind]!));
    return new FakeMediaStream(tracks);
  });

  getDisplayMedia = vi.fn(
    async (_options?: DisplayMediaStreamOptions): Promise<MediaStream> => this.displayMediaFactory(),
  );

  onDeviceChange = vi.fn((callback: () => void): (() => void) => {
    this.deviceChangeListeners.add(callback);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.deviceChangeListeners.delete(callback);
    };
  });

  setUserMediaStream(stream: MediaStream): void {
    this.userMediaError = null;
    this.userMediaTemplate = stream;
  }

  failUserMediaAlways(error: unknown): void {
    this.userMediaError = error;
  }

  setDisplayMediaStream(stream: MediaStream): void {
    this.displayMediaFactory = () => stream;
  }

  setDevices(devices: DeviceItem[]): void {
    this.devices = devices.map((device) => ({ ...device }));
  }

  simulateDeviceChange(): void {
    for (const listener of [...this.deviceChangeListeners]) listener();
  }

  private installedDevices(): InstalledDevice[] {
    const fromTemplate = this.userMediaTemplate.getTracks().map(
      (track): InstalledDevice => ({
        kind: track.kind as TrackKind,
        deviceId: track.getSettings().deviceId ?? "",
        label: track.label,
      }),
    );
    const additional = this.devices.filter(
      (device) =>
        !fromTemplate.some((candidate) => candidate.kind === device.kind && candidate.deviceId === device.deviceId),
    );
    return [...fromTemplate, ...additional];
  }
}
