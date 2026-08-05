import type { FishjamClient } from "@fishjam-cloud/tsunami";
import { createContext, type RefObject } from "react";

export const FishjamClientContext = createContext<RefObject<FishjamClient> | null>(null);
