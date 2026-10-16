import { FishjamProvider as ReactClientFishjamProvider } from '@fishjam-cloud/react-client';
import { describe, expect, it, vi } from 'vitest';

import { ReactNativeDeviceManager } from './devices/ReactNativeDeviceManager';
import { FishjamProvider } from './FishjamProvider';

const nativeMediaDevices = vi.hoisted(() => ({
  enumerateDevices: vi.fn(),
  getDisplayMedia: vi.fn(),
  getUserMedia: vi.fn(),
}));

vi.mock('@fishjam-cloud/react-native-webrtc', () => ({
  mediaDevices: nativeMediaDevices,
  permissions: { query: vi.fn() },
  MediaStream: class {},
}));

type RenderedProviderProps = {
  clientType?: string;
  deviceManager?: unknown;
  fishjamId?: string;
};

const renderedProps = (element: ReturnType<typeof FishjamProvider>): RenderedProviderProps =>
  element.props as RenderedProviderProps;

describe('FishjamProvider (mobile)', () => {
  it('always runs on the native device manager with the mobile client type', () => {
    const element = FishjamProvider({ fishjamId: 'test-fishjam-id' });

    expect(element.type).toBe(ReactClientFishjamProvider);
    expect(renderedProps(element).clientType).toBe('mobile');
    expect(renderedProps(element).deviceManager).toBeInstanceOf(ReactNativeDeviceManager);
    expect(renderedProps(element).fishjamId).toBe('test-fishjam-id');
  });

  it('reuses one device manager across provider instances', () => {
    const first = FishjamProvider({ fishjamId: 'a' });
    const second = FishjamProvider({ fishjamId: 'b' });

    expect(renderedProps(first).deviceManager).toBe(renderedProps(second).deviceManager);
  });
});
