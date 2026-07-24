export type DeviceType = "audio" | "video";

export type DeviceItem = {
  deviceId: string;
  label: string;
  kind: DeviceType;
};

/** Optional storage for the last device selected for each media kind. */
export interface IDevicePersistence {
  getLastDevice(type: DeviceType): DeviceItem | null | Promise<DeviceItem | null>;
  saveLastDevice(type: DeviceType, device: DeviceItem): void | Promise<void>;
}

/**
 * Platform boundary for local media acquisition.
 *
 * The SDK core uses this interface instead of accessing platform globals such
 * as `navigator.mediaDevices`. Implementations may use browser APIs, native
 * APIs, or deterministic test doubles.
 */
export interface IDeviceManager {
  readonly persistence?: IDevicePersistence;

  enumerateDevices(): Promise<DeviceItem[]>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  getDisplayMedia(options?: DisplayMediaStreamOptions): Promise<MediaStream>;
  onDeviceChange(callback: () => void): () => void;
}
