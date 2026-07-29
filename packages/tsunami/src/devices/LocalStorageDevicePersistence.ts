import type { DeviceItem, DeviceType, IDevicePersistence } from "./deviceManager";

const storageKey = (type: DeviceType) => `last-selected-${type}-device`;

const isStoredDevice = (value: unknown): value is Pick<DeviceItem, "deviceId" | "label"> => {
  if (!value || typeof value !== "object") return false;

  const device = value as Partial<DeviceItem>;
  return typeof device.deviceId === "string" && typeof device.label === "string";
};

/** Browser persistence for the last selected camera and microphone. */
export class LocalStorageDevicePersistence implements IDevicePersistence {
  public getLastDevice(type: DeviceType): DeviceItem | null {
    const serialized = this.getStorage().getItem(storageKey(type));
    if (serialized === null) return null;

    let storedDevice: unknown;
    try {
      storedDevice = JSON.parse(serialized);
    } catch {
      return null;
    }
    if (!isStoredDevice(storedDevice)) return null;

    // The storage key is authoritative. This also migrates records written by
    // react-client, whose MediaDeviceInfo kind was "audioinput"/"videoinput".
    return { deviceId: storedDevice.deviceId, label: storedDevice.label, kind: type };
  }

  public saveLastDevice(type: DeviceType, device: DeviceItem): void {
    const storedDevice: DeviceItem = { deviceId: device.deviceId, label: device.label, kind: type };
    this.getStorage().setItem(storageKey(type), JSON.stringify(storedDevice));
  }

  private getStorage(): Storage {
    const storage = globalThis.localStorage;
    if (!storage) throw new Error("LocalStorage API is not available in this environment");

    return storage;
  }
}
