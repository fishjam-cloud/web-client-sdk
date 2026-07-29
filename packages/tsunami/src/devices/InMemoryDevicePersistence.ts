import type { DeviceItem, DeviceType, IDevicePersistence } from "./deviceManager";

export class InMemoryDevicePersistence implements IDevicePersistence {
  private readonly devices = new Map<DeviceType, DeviceItem>();

  public getLastDevice(type: DeviceType): DeviceItem | null {
    const device = this.devices.get(type);
    return device ? { ...device } : null;
  }

  public saveLastDevice(type: DeviceType, device: DeviceItem): void {
    this.devices.set(type, { deviceId: device.deviceId, label: device.label, kind: type });
  }
}
