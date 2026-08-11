import type {
  DeviceItem,
  DeviceType,
  IDeviceManager,
  IDevicePersistence,
  PlatformMediaStreamTrack,
} from "./deviceManager";
import { classifyDeviceError } from "./errors";

export type WebDeviceManagerOptions = {
  persistence?: IDevicePersistence;
};

const inputDeviceKinds: Partial<Record<MediaDeviceKind, DeviceType>> = {
  audioinput: "audio",
  videoinput: "video",
};

export class WebDeviceManager implements IDeviceManager<MediaStream> {
  public readonly persistence?: IDevicePersistence;

  public constructor({ persistence }: WebDeviceManagerOptions = {}) {
    this.persistence = persistence;
  }

  public async enumerateDevices(): Promise<DeviceItem[]> {
    const devices = await this.getMediaDevices().enumerateDevices();

    return devices.flatMap((device) => {
      const kind = inputDeviceKinds[device.kind];
      if (!kind) return [];

      return [{ deviceId: device.deviceId, label: device.label, kind }];
    });
  }

  public async getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    const mediaDevices = this.getMediaDevices();
    try {
      return await mediaDevices.getUserMedia(constraints);
    } catch (error) {
      throw classifyDeviceError(error);
    }
  }

  public async getDisplayMedia(options?: DisplayMediaStreamOptions): Promise<MediaStream> {
    const mediaDevices = this.getMediaDevices();
    try {
      return await mediaDevices.getDisplayMedia(options);
    } catch (error) {
      throw classifyDeviceError(error);
    }
  }

  public createMediaStream(tracks: PlatformMediaStreamTrack[]): MediaStream {
    return new MediaStream(tracks as MediaStreamTrack[]);
  }

  public onDeviceChange(callback: () => void): () => void {
    const mediaDevices = this.getMediaDevices();

    // React Native's polyfilled navigator.mediaDevices has no devicechange
    // events; device-list refreshes then only happen on explicit operations.
    if (typeof mediaDevices.addEventListener !== "function") return () => {};

    const listener = () => callback();
    let subscribed = true;

    mediaDevices.addEventListener("devicechange", listener);

    return () => {
      if (!subscribed) return;
      subscribed = false;
      mediaDevices.removeEventListener("devicechange", listener);
    };
  }

  private getMediaDevices(): MediaDevices {
    const mediaDevices = globalThis.navigator?.mediaDevices;
    if (!mediaDevices) throw new Error("MediaDevices API is not available in this environment");

    return mediaDevices;
  }
}
