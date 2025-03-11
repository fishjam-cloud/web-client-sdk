import { createContext } from "react";

import type { InitializeDevicesErrors } from "../hooks/devices/useInitializeDevices";

export const InitDevicesContext = createContext<(() => Promise<InitializeDevicesErrors | null>) | null>(null);
