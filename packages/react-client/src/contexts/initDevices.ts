import { createContext } from "react";

import type { InitializeDevicesSettings } from "../hooks/internal/devices/useMediaDevices";
import type { InitializeDevicesResult } from "../types/public";

export const InitDevicesContext = createContext<
  ((settings?: InitializeDevicesSettings) => Promise<InitializeDevicesResult>) | null
>(null);
