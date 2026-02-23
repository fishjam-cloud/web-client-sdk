import type { getLogger } from "@fishjam-cloud/ts-client";

import type { DeviceError } from "../types/public";

export const PERMISSION_DENIED: DeviceError = { name: "NotAllowedError" };
export const OVERCONSTRAINED_ERROR: DeviceError = { name: "OverconstrainedError" };
export const NOT_FOUND_ERROR: DeviceError = { name: "NotFoundError" };
export const UNHANDLED_ERROR: DeviceError = { name: "UNHANDLED_ERROR" };

// https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#exceptions
// OverconstrainedError has higher priority than NotAllowedError
export const parseUserMediaError = (error: unknown, logger: ReturnType<typeof getLogger>): DeviceError => {
  const name = error instanceof Error ? error.name : "";
  switch (name) {
    case "NotAllowedError":
      return PERMISSION_DENIED;
    case "OverconstrainedError":
      return OVERCONSTRAINED_ERROR;
    case "NotFoundError":
      return NOT_FOUND_ERROR;
    default:
      logger.warn({ name: "Unhandled getUserMedia error", error });
      return UNHANDLED_ERROR;
  }
};
