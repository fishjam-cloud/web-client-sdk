import { mediaDevices } from '@fishjam-cloud/react-native-webrtc';
import {
  type DeviceItem,
  type DeviceType,
  type IDeviceManager,
  type IDevicePersistence,
  InMemoryDevicePersistence,
} from '@fishjam-cloud/tsunami';

export type ReactNativeDeviceManagerOptions = {
  persistence?: IDevicePersistence;
};

type NativeMediaDevices = typeof mediaDevices & {
  addEventListener(type: 'devicechange', listener: () => void): void;
  removeEventListener(type: 'devicechange', listener: () => void): void;
};

type NativeDeviceInfo = {
  deviceId: string;
  kind: string;
  label: string;
};

const inputDeviceKinds: Partial<Record<string, DeviceType>> = {
  audioinput: 'audio',
  videoinput: 'video',
};

const defaultPersistence = new InMemoryDevicePersistence();

// The runtime object extends EventTarget, but react-native-webrtc's bundled
// declaration does not currently expose the inherited listener methods.
const nativeMediaDevices = mediaDevices as NativeMediaDevices;

export class ReactNativeDeviceManager implements IDeviceManager {
  public readonly persistence: IDevicePersistence;

  public constructor({ persistence = defaultPersistence }: ReactNativeDeviceManagerOptions = {}) {
    this.persistence = persistence;
  }

  public async enumerateDevices(): Promise<DeviceItem[]> {
    const devices = (await nativeMediaDevices.enumerateDevices()) as NativeDeviceInfo[];

    return devices.flatMap((device) => {
      const kind = inputDeviceKinds[device.kind];
      if (!kind) return [];

      return [{ deviceId: device.deviceId, label: device.label, kind }];
    });
  }

  public async getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    const nativeConstraints = constraints as Parameters<typeof nativeMediaDevices.getUserMedia>[0];
    const stream = await nativeMediaDevices.getUserMedia(nativeConstraints);

    // React Native WebRTC uses its own stream type, although it provides the API used by tsunami.
    return stream as unknown as MediaStream;
  }

  public async getDisplayMedia(_options?: DisplayMediaStreamOptions): Promise<MediaStream> {
    const stream = await nativeMediaDevices.getDisplayMedia();

    // React Native WebRTC uses its own stream type, although it provides the API used by tsunami.
    return stream as unknown as MediaStream;
  }

  // react-native-webrtc does not currently emit devicechange; this method exists to satisfy IDeviceManager.
  public onDeviceChange(callback: () => void): () => void {
    const listener = () => callback();
    let subscribed = true;

    nativeMediaDevices.addEventListener('devicechange', listener);

    return () => {
      if (!subscribed) return;
      subscribed = false;
      nativeMediaDevices.removeEventListener('devicechange', listener);
    };
  }
}
