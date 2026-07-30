import type { MediaStream as ReactNativeMediaStream } from '@fishjam-cloud/react-native-webrtc';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InMemoryDevicePersistence } from './InMemoryDevicePersistence';
import { ReactNativeDeviceManager } from './ReactNativeDeviceManager';

const nativeMediaDevices = vi.hoisted(() => ({
  addEventListener: vi.fn(),
  enumerateDevices: vi.fn(),
  getDisplayMedia: vi.fn(),
  getUserMedia: vi.fn(),
  removeEventListener: vi.fn(),
}));

vi.mock('@fishjam-cloud/react-native-webrtc', () => ({ mediaDevices: nativeMediaDevices }));

afterEach(() => {
  vi.clearAllMocks();
});

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
    expect(nativeMediaDevices.addEventListener).not.toHaveBeenCalled();
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

  it('uses native display-media defaults instead of forwarding incompatible browser options', async () => {
    const displayStream = {} as ReactNativeMediaStream;
    nativeMediaDevices.getDisplayMedia.mockResolvedValue(displayStream);
    const manager = new ReactNativeDeviceManager();

    await expect(manager.getDisplayMedia({ video: true })).resolves.toBe(displayStream);

    expect(nativeMediaDevices.getDisplayMedia).toHaveBeenCalledWith();
  });

  it('removes a device-change listener exactly once', () => {
    const callback = vi.fn();
    const manager = new ReactNativeDeviceManager();

    const cleanup = manager.onDeviceChange(callback);
    const listener = nativeMediaDevices.addEventListener.mock.calls[0][1] as () => void;
    listener();
    cleanup();
    cleanup();

    expect(callback).toHaveBeenCalledOnce();
    expect(nativeMediaDevices.addEventListener).toHaveBeenCalledWith('devicechange', listener);
    expect(nativeMediaDevices.removeEventListener).toHaveBeenCalledOnce();
    expect(nativeMediaDevices.removeEventListener).toHaveBeenCalledWith('devicechange', listener);
  });
});
