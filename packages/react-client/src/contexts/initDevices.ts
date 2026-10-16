import { createContext } from "react";

import type { InitializeDevicesResult, InitializeDevicesSettings } from "../types/public";

export const InitDevicesContext = createContext<
  ((settings?: InitializeDevicesSettings) => Promise<InitializeDevicesResult>) | null
>(null);
