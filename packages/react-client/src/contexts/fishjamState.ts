import { createContext } from "react";

import type { FishjamClientState } from "../hooks/internal/useFishjamClientState";

export const FishjamClientStateContext = createContext<FishjamClientState>(null);
