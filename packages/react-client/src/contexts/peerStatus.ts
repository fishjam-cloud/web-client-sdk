import { createContext } from "react";

import type { PeerStatus } from "../types/public";

export const PeerStatusContext = createContext<PeerStatus>("idle");
