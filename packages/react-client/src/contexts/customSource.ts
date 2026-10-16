import { createContext } from "react";

import type { CustomSourceManager } from "../types/internal";

export const CustomSourceContext = createContext<CustomSourceManager | null>(null);
