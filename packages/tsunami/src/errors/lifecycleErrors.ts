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
