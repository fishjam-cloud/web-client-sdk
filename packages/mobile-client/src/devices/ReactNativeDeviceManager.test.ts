import type { MediaStream as ReactNativeMediaStream } from '@fishjam-cloud/react-native-webrtc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryDevicePersistence } from './InMemoryDevicePersistence';
import { ReactNativeDeviceManager } from './ReactNativeDeviceManager';

const nativeMediaDevices = vi.hoisted(() => ({
  enumerateDevices: vi.fn(),
  getDisplayMedia: vi.fn(),
  getUserMedia: vi.fn(),
}));

const nativePermissions = vi.hoisted(() => ({
  query: vi.fn(),
}));

const FakeNativeMediaStream = vi.hoisted(
  () =>
    class {
      constructor(public readonly tracks: unknown[]) {}
      getTracks() {
        return this.tracks;
      }
    },
);

vi.mock('@fishjam-cloud/react-native-webrtc', () => ({
  mediaDevices: nativeMediaDevices,
  permissions: nativePermissions,
  MediaStream: FakeNativeMediaStream,
}));

beforeEach(() => {
  nativePermissions.query.mockResolvedValue('granted');
});

afterEach(() => {
  vi.clearAllMocks();
});

// react-native-webrtc's MediaStreamError shape: a plain object, NOT an Error.
const nativeError = (name: string) => ({ name, message: name });

describe('ReactNativeDeviceManager', () => {
  it('has inert construction', () => {
    const persistence = {
      getLastDevice: vi.fn(),
      saveLastDevice: vi.fn(),
    };
    const manager = new ReactNativeDeviceManager({ persistence });

    expect(manager.persistence).toBe(persistence);
    expect(nativeMediaDevices.enumerateDevices).not.toHaveBeenCalled();
    expect(nativeMediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(nativeMediaDevices.getDisplayMedia).not.toHaveBeenCalled();
  });

  it('shares session-scoped persistence between manager instances by default', () => {
    const firstManager = new ReactNativeDeviceManager();
    const secondManager = new ReactNativeDeviceManager();

    expect(firstManager.persistence).toBeInstanceOf(InMemoryDevicePersistence);
    expect(secondManager.persistence).toBe(firstManager.persistence);
  });

  it('normalizes native input devices and excludes audio outputs', async () => {
    nativeMediaDevices.enumerateDevices.mockResolvedValue([
      { deviceId: 'camera-1', kind: 'videoinput', label: 'Front camera' },
      { deviceId: 'microphone-1', kind: 'audioinput', label: 'Built-in microphone' },
      { deviceId: 'speaker-1', kind: 'audiooutput', label: 'Speaker' },
    ]);
    const manager = new ReactNativeDeviceManager();

    await expect(manager.enumerateDevices()).resolves.toEqual([
      { deviceId: 'camera-1', kind: 'video', label: 'Front camera' },
      { deviceId: 'microphone-1', kind: 'audio', label: 'Built-in microphone' },
    ]);
  });

  it('delegates user-media acquisition without changing its constraints', async () => {
    const userStream = {} as ReactNativeMediaStream;
    const userConstraints = Object.freeze({ audio: true, video: Object.freeze({ facingMode: 'user' }) });
    nativeMediaDevices.getUserMedia.mockResolvedValue(userStream);
    const manager = new ReactNativeDeviceManager();

    await expect(manager.getUserMedia(userConstraints)).resolves.toBe(userStream);

    expect(nativeMediaDevices.getUserMedia).toHaveBeenCalledWith(userConstraints);
  });

  it('classifies the native SecurityError (a non-Error object) as permission denial', async () => {
    nativeMediaDevices.getUserMedia.mockRejectedValue(nativeError('SecurityError'));
    const manager = new ReactNativeDeviceManager();

    await expect(manager.getUserMedia({ video: true })).rejects.toMatchObject({ name: 'NotAllowedError' });
  });

  it('classifies other native rejections through the shared name mapping', async () => {
    nativeMediaDevices.getUserMedia.mockRejectedValue(nativeError('OverconstrainedError'));
    const manager = new ReactNativeDeviceManager();

    await expect(manager.getUserMedia({ video: true })).rejects.toMatchObject({ name: 'OverconstrainedError' });

    nativeMediaDevices.getUserMedia.mockRejectedValue('total garbage');
    await expect(manager.getUserMedia({ video: true })).rejects.toMatchObject({ name: 'UNHANDLED_ERROR' });
  });

  it('warns when acquiring media without granted permissions, but still acquires', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    nativePermissions.query.mockResolvedValue('denied');
    nativeMediaDevices.getUserMedia.mockResolvedValue({} as ReactNativeMediaStream);
    const manager = new ReactNativeDeviceManager();

    await manager.getUserMedia({ video: true, audio: true });

    expect(warn).toHaveBeenCalledWith('Attempting to access camera with permission status: "denied".');
    expect(warn).toHaveBeenCalledWith('Attempting to access microphone with permission status: "denied".');
    expect(nativeMediaDevices.getUserMedia).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('queries permissions only for the requested kinds', async () => {
    nativeMediaDevices.getUserMedia.mockResolvedValue({} as ReactNativeMediaStream);
    const manager = new ReactNativeDeviceManager();

    await manager.getUserMedia({ audio: true });

    expect(nativePermissions.query).toHaveBeenCalledTimes(1);
    expect(nativePermissions.query).toHaveBeenCalledWith({ name: 'microphone' });
  });

  it('forwards constructor display-media options to the native call', async () => {
    const displayStream = {} as ReactNativeMediaStream;
    nativeMediaDevices.getDisplayMedia.mockResolvedValue(displayStream);
    const displayMediaOptions = { android: { resolutionScale: 0.5 } };
    const manager = new ReactNativeDeviceManager({ displayMediaOptions });

    await expect(manager.getDisplayMedia({ video: true })).resolves.toBe(displayStream);

    expect(nativeMediaDevices.getDisplayMedia).toHaveBeenCalledWith(displayMediaOptions);
  });

  it('wraps tracks in a native stream', () => {
    const manager = new ReactNativeDeviceManager();
    const track = { id: 'track-1' };

    const stream = manager.createMediaStream([track as never]);

    expect(stream).toBeInstanceOf(FakeNativeMediaStream);
    expect(stream.getTracks()).toEqual([track]);
  });

  it('returns an inert cleanup from onDeviceChange without touching the native module', () => {
    const manager = new ReactNativeDeviceManager();

    const cleanup = manager.onDeviceChange(vi.fn());
    cleanup();
    cleanup();

    expect(nativeMediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
});
