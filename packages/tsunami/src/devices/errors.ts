import { type ErrorRecoverability, FishjamError } from "../errors/FishjamError";

export type DeviceErrorName = "NotAllowedError" | "NotFoundError" | "OverconstrainedError" | "UNHANDLED_ERROR";

/**
 * A local media device could not be acquired. Rejected by device operations
 * and mirrored into the matching `ClientState` error field; a later success
 * on the same device clears it.
 */
export abstract class DeviceError extends FishjamError {
  public abstract override readonly name: DeviceErrorName;
}

/** The user (or browser policy) denied access to the device. */
export class DevicePermissionDeniedError extends DeviceError {
  public override readonly name = "NotAllowedError";
  public readonly recoverability: ErrorRecoverability = "user_action";

  public constructor(options?: { cause?: unknown }) {
    super("Permission to use the device was denied", options);
  }
}

/** No device of the requested kind is available. */
export class DeviceNotFoundError extends DeviceError {
  public override readonly name = "NotFoundError";
  public readonly recoverability: ErrorRecoverability = "user_action";

  public constructor(options?: { cause?: unknown }) {
    super("No matching device was found", options);
  }
}

/** The requested constraints cannot be satisfied by any available device. */
export class DeviceOverconstrainedError extends DeviceError {
  public override readonly name = "OverconstrainedError";
  public readonly recoverability: ErrorRecoverability = "retry";

  public constructor(options?: { cause?: unknown }) {
    super("The requested device constraints cannot be satisfied", options);
  }
}

/** Device acquisition failed for a reason the SDK does not recognize. */
export class UnknownDeviceError extends DeviceError {
  public override readonly name = "UNHANDLED_ERROR";
  public readonly recoverability: ErrorRecoverability = "retry";

  public constructor(options?: { cause?: unknown }) {
    super("Device acquisition failed", options);
  }
}

// https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#exceptions
/**
 * Maps a platform media-acquisition failure to a {@link DeviceError}.
 * Intended for `IDeviceManager` implementations — the platform error shape
 * never crosses into the SDK core.
 */
export const classifyDeviceError = (error: unknown): DeviceError => {
  if (error instanceof DeviceError) return error;

  const name = error instanceof Error ? error.name : "";
  switch (name) {
    case "NotAllowedError":
      return new DevicePermissionDeniedError({ cause: error });
    case "OverconstrainedError":
      return new DeviceOverconstrainedError({ cause: error });
    case "NotFoundError":
      return new DeviceNotFoundError({ cause: error });
    default:
      return new UnknownDeviceError({ cause: error });
  }
};
