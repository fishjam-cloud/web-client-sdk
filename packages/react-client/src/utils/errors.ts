import type { DeviceError } from "../types/public";

export const PERMISSION_DENIED: DeviceError = { name: "NotAllowedError" };
export const OVERCONSTRAINED_ERROR: DeviceError = { name: "OverconstrainedError" };
export const NOT_FOUND_ERROR: DeviceError = { name: "NotFoundError" };
export const UNHANDLED_ERROR: DeviceError = { name: "UNHANDLED_ERROR" };

// https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#exceptions
// OverconstrainedError has higher priority than NotAllowedError
export const parseUserMediaError = (error: unknown): DeviceError | null => {
  if (!(error instanceof DOMException)) {
    console.warn({ name: "Unhandled getUserMedia error", error });
    return null;
  }

  if (error.name === "NotAllowedError") {
    return PERMISSION_DENIED;
  } else if (error.name === "OverconstrainedError") {
    return OVERCONSTRAINED_ERROR;
  } else if (error.name === "NotFoundError") {
    return NOT_FOUND_ERROR;
  }

  return null;
};
