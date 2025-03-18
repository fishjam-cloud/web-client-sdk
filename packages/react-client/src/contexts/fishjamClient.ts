import type { FishjamClient } from "@fishjam-cloud/ts-client";
import { createContext, type RefObject } from "react";

export const FishjamClientContext = createContext<RefObject<FishjamClient> | null>(null);
