import { createContext } from "react";

import type { UseScreenshareResult } from "../types/internal";

export const ScreenshareContext = createContext<UseScreenshareResult | null>(null);
