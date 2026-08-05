/**
 * TypeScript SDK core for Fishjam clients.
 *
 * @packageDocumentation
 */
export type { DeviceOrchestrator } from "./controllers/DeviceOrchestrator";
export type { TrackDeviceController } from "./controllers/TrackDeviceController";
export type {
  DeviceItem,
  DeviceType,
  IDeviceManager,
  IDevicePersistence,
  PlatformMediaStream,
  PlatformMediaStreamTrack,
} from "./devices/deviceManager";
export {
  classifyDeviceError,
  DeviceError,
  type DeviceErrorName,
  DeviceNotFoundError,
  DeviceOverconstrainedError,
  DevicePermissionDeniedError,
  UnknownDeviceError,
} from "./devices/errors";
export { LocalStorageDevicePersistence } from "./devices/LocalStorageDevicePersistence";
export { WebDeviceManager, type WebDeviceManagerOptions } from "./devices/WebDeviceManager";
export { type ErrorRecoverability, FishjamError } from "./errors/FishjamError";
export { ClientDisposedError, DeviceManagerMissingError } from "./errors/lifecycleErrors";
export { FishjamClient, type FishjamClientConfig } from "./FishjamClient";
export type {
  BandwidthLimits,
  InitializeDevicesResult,
  InitializeDevicesSettings,
  InitializeDevicesStatus,
  MiddlewareResult,
  SimulcastBandwidthLimits,
  StreamConfig,
  TrackMiddleware,
} from "./mediaTypes";
export {
  type ClientState,
  createInitialClientState,
  type LocalDeviceState,
  type PeerStatus,
} from "./state/clientState";
export { StateStore, type StateStoreOptions, type StoreListener } from "./state/StateStore";
export * from "@fishjam-cloud/ts-client";
