import { createContext } from "react";

import type { UseScreenshareResult } from "../hooks/internal/useScreenshareManager";

export const ScreenshareContext = createContext<UseScreenshareResult | null>(null);
