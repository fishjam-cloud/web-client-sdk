import type { PersistLastDeviceHandlers } from "../types/public";
import type { DeviceType } from "../DeviceManager";

export function createStorageConfig(
  deviceType: DeviceType,
  storage?: boolean | PersistLastDeviceHandlers,
): PersistLastDeviceHandlers | null {
  if (storage === false) return null;
  if (storage === true || storage === undefined) return getLocalStorageConfig(deviceType);
  return storage;
}

const getLocalStorageConfig = (deviceType: DeviceType): PersistLastDeviceHandlers => {
  const key = `last-selected-${deviceType}-device`;
  return {
    getLastDevice: () => loadObject<MediaDeviceInfo | null>(key, null),
    saveLastDevice: (info: MediaDeviceInfo) => saveObject<MediaDeviceInfo>(key, info),
  };
};

const loadObject = <T>(key: string, defaultValue: T): T => {
  const stringValue = loadString(key, "");
  if (stringValue === "") {
    return defaultValue;
  }
  return JSON.parse(stringValue) as T;
};

const loadString = (key: string, defaultValue = "") => {
  const value = localStorage.getItem(key);
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return value;
};

const saveObject = <T>(key: string, value: T) => {
  const stringValue = JSON.stringify(value);
  saveString(key, stringValue);
};

const saveString = (key: string, value: string) => {
  localStorage.setItem(key, value);
};
