import { type ErrorRecoverability, FishjamError } from "./FishjamError";

/**
 * Thrown when a method is called on a client after `dispose()`.
 *
 * A disposed client is permanently unusable — create a new `FishjamClient`
 * instance instead of retrying. You may also see this error as the rejection
 * of an operation that was still in flight when the client was disposed.
 */
export class ClientDisposedError extends FishjamError {
  public readonly recoverability: ErrorRecoverability = "fatal";

  public constructor() {
    super("FishjamClient has been disposed and cannot be used again");
    this.name = "ClientDisposedError";
  }
}

/**
 * Thrown when a device-related method is called on a client that was created
 * without a device manager. Construct the client with a `deviceManager` to
 * use the device API; a signalling-only client cannot acquire local media.
 */
export class DeviceManagerMissingError extends FishjamError {
  public readonly recoverability: ErrorRecoverability = "fatal";

  public constructor() {
    super("This FishjamClient was created without a device manager, so the device API is unavailable");
    this.name = "DeviceManagerMissingError";
  }
}
