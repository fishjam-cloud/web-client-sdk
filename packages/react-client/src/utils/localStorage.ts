import type { DeviceType } from "../types/public";

const getLocalStorageKey = (deviceType: DeviceType) => `last-selected-${deviceType}-device`;

export const getLastDevice = (deviceType: DeviceType) =>
  loadObject<MediaDeviceInfo | null>(getLocalStorageKey(deviceType), null);

export const saveLastDevice = (info: MediaDeviceInfo, deviceType: DeviceType) =>
  saveObject<MediaDeviceInfo>(getLocalStorageKey(deviceType), info);

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
