import { createContext } from "react";

import type { DeviceApi } from "../hooks/internal/device/useDevice";
import type { TrackManager } from "../types/internal";

export type CameraContextType = {
  videoTrackManager: TrackManager;
  camera: DeviceApi;
};

export const CameraContext = createContext<CameraContextType | null>(null);
