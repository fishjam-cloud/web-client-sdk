const storageKey = (type) => `last-selected-${type}-device`;
const isStoredDevice = (value) => {
  if (!value || typeof value !== "object") return false;
  const device = value;
  return typeof device.deviceId === "string" && typeof device.label === "string";
};
/** Browser persistence for the last selected camera and microphone. */
export class LocalStorageDevicePersistence {
  getLastDevice(type) {
    const serialized = this.getStorage().getItem(storageKey(type));
    if (serialized === null) return null;
    let storedDevice;
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
  saveLastDevice(type, device) {
    const storedDevice = { deviceId: device.deviceId, label: device.label, kind: type };
    this.getStorage().setItem(storageKey(type), JSON.stringify(storedDevice));
  }
  getStorage() {
    const storage = globalThis.localStorage;
    if (!storage) throw new Error("LocalStorage API is not available in this environment");
    return storage;
  }
}
