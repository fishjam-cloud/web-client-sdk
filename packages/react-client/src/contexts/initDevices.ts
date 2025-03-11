import { createContext } from "react";

export const InitDevicesContext = createContext<(() => Promise<void>) | null>(null);
