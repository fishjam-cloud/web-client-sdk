import {
  mediaDevices,
  MediaStream as ReactNativeMediaStream,
  type MediaStreamTrack as ReactNativeMediaStreamTrack,
  permissions,
} from '@fishjam-cloud/react-native-webrtc';
import {
  classifyDeviceError,
  type DeviceError,
  type DeviceItem,
  DevicePermissionDeniedError,
  type DeviceType,
  type IDeviceManager,
  type IDevicePersistence,
  type PlatformMediaStreamTrack,
} from '@fishjam-cloud/tsunami';

import { InMemoryDevicePersistence } from './InMemoryDevicePersistence';

export type ReactNativeDisplayMediaOptions = {
  android?: {
    createConfigForDefaultDisplay?: boolean;
    resolutionScale?: number;
  };
};

export type ReactNativeDeviceManagerOptions = {
  persistence?: IDevicePersistence;
  /** Forwarded to react-native-webrtc's getDisplayMedia (Android screen-capture tuning). */
  displayMediaOptions?: ReactNativeDisplayMediaOptions;
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

// react-native-webrtc rejects with MediaStreamError, which does not extend
// Error and reports permission denial as "SecurityError" — classify by the
// name field before deferring to the shared web-name mapping.
const classifyNativeDeviceError = (error: unknown): DeviceError => {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  if (name === 'SecurityError' || name === 'NotAllowedError') {
    return new DevicePermissionDeniedError({ cause: error });
  }
  return classifyDeviceError(error instanceof Error ? error : Object.assign(new Error(name), { name }));
};

const warnWhenPermissionMissing = async (constraints: MediaStreamConstraints): Promise<void> => {
  try {
    const [cameraStatus, microphoneStatus] = await Promise.all([
      constraints.video ? permissions.query({ name: 'camera' }) : null,
      constraints.audio ? permissions.query({ name: 'microphone' }) : null,
    ]);

    if (cameraStatus && cameraStatus !== 'granted') {
      console.warn(`Attempting to access camera with permission status: "${cameraStatus}".`);
    }
    if (microphoneStatus && microphoneStatus !== 'granted') {
      console.warn(`Attempting to access microphone with permission status: "${microphoneStatus}".`);
    }
  } catch (error) {
    console.warn('Failed to check permissions before getUserMedia', error);
  }
};

export class ReactNativeDeviceManager implements IDeviceManager<ReactNativeMediaStream> {
  public readonly persistence: IDevicePersistence;
  private readonly displayMediaOptions?: ReactNativeDisplayMediaOptions;

  public constructor({ persistence = defaultPersistence, displayMediaOptions }: ReactNativeDeviceManagerOptions = {}) {
    this.persistence = persistence;
    this.displayMediaOptions = displayMediaOptions;
  }

  public async enumerateDevices(): Promise<DeviceItem[]> {
    const devices = (await mediaDevices.enumerateDevices()) as NativeDeviceInfo[];

    return devices.flatMap((device) => {
      const kind = inputDeviceKinds[device.kind];
      if (!kind) return [];

      return [{ deviceId: device.deviceId, label: device.label, kind }];
    });
  }

  public async getUserMedia(constraints: MediaStreamConstraints): Promise<ReactNativeMediaStream> {
    await warnWhenPermissionMissing(constraints);

    const nativeConstraints = constraints as Parameters<typeof mediaDevices.getUserMedia>[0];
    try {
      return await mediaDevices.getUserMedia(nativeConstraints);
    } catch (error) {
      throw classifyNativeDeviceError(error);
    }
  }

  // The DOM options shape is disjoint from react-native-webrtc's constraint
  // shape, so it is ignored; screen-capture tuning comes from the constructor.
  public async getDisplayMedia(_options?: DisplayMediaStreamOptions): Promise<ReactNativeMediaStream> {
    try {
      return await mediaDevices.getDisplayMedia(this.displayMediaOptions);
    } catch (error) {
      throw classifyNativeDeviceError(error);
    }
  }

  public createMediaStream(tracks: PlatformMediaStreamTrack[]): ReactNativeMediaStream {
    return new ReactNativeMediaStream(tracks as ReactNativeMediaStreamTrack[]);
  }

  // react-native-webrtc never emits devicechange, so there is nothing to
  // subscribe to; device lists refresh on explicit operations instead.
  public onDeviceChange(_callback: () => void): () => void {
    return () => {};
  }
}
