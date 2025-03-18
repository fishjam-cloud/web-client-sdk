import { createContext } from "react";

import type { InitializeDevicesResult } from "../types/public";

export const InitDevicesContext = createContext<(() => Promise<InitializeDevicesResult>) | null>(null);
