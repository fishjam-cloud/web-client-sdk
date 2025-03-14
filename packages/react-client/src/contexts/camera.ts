import { createContext } from "react";

import type { DeviceManager } from "../hooks/internal/device/useDevice";
import type { TrackManager } from "../types/internal";

export type CameraContextType = {
  videoTrackManager: TrackManager;
  camera: DeviceManager;
};

export const CameraContext = createContext<CameraContextType | null>(null);
