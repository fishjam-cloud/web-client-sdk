import { createContext } from "react";

import type { InitializeDevicesResult } from "../types/public";

import type { InitializeDevicesSettings } from "../hooks/internal/devices/useMediaDevices";

export const InitDevicesContext = createContext<
  ((settings?: InitializeDevicesSettings) => Promise<InitializeDevicesResult>) | null
>(null);
