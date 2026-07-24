/**
 * Thrown when an operation is attempted on a client that has reached the end
 * of its lifecycle.
 */
export class ClientDisposedError extends Error {
  public constructor() {
    super("FishjamClient has been disposed and cannot be used again");
    this.name = "ClientDisposedError";
  }
}
