import { createContext } from "react";

import type { CustomSourceManager } from "../hooks/internal/useCustomSourceManager";

export const CustomSourceContext = createContext<CustomSourceManager | null>(null);
