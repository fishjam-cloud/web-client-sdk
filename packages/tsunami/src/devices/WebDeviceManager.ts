import type { DeviceItem, DeviceType, IDeviceManager, IDevicePersistence } from "./deviceManager";

export type WebDeviceManagerOptions = {
  persistence?: IDevicePersistence;
};

const inputDeviceKinds: Partial<Record<MediaDeviceKind, DeviceType>> = {
  audioinput: "audio",
  videoinput: "video",
};

export class WebDeviceManager implements IDeviceManager {
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
    return this.getMediaDevices().getUserMedia(constraints);
  }

  public async getDisplayMedia(options?: DisplayMediaStreamOptions): Promise<MediaStream> {
    return this.getMediaDevices().getDisplayMedia(options);
  }

  public onDeviceChange(callback: () => void): () => void {
    const mediaDevices = this.getMediaDevices();
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
