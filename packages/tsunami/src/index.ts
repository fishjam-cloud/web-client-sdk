/**
 * TypeScript SDK core for Fishjam clients.
 *
 * @packageDocumentation
 */
export type { DeviceItem, DeviceType, IDeviceManager, IDevicePersistence } from "./devices/deviceManager";
export { LocalStorageDevicePersistence } from "./devices/LocalStorageDevicePersistence";
export { WebDeviceManager, type WebDeviceManagerOptions } from "./devices/WebDeviceManager";
export { ClientDisposedError } from "./errors";
export { FishjamClient } from "./FishjamClient";
export * from "@fishjam-cloud/ts-client";

export type MiddlewareResult = {
  track: MediaStreamTrack;
  onClear?: () => void;
};

export type TrackMiddleware = ((track: MediaStreamTrack) => MiddlewareResult | Promise<MiddlewareResult>) | null;
