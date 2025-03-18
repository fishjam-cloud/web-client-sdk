import { createContext } from "react";

import type { DeviceManager } from "../hooks/internal/devices/useDeviceManager";
import type { TrackManager } from "../types/internal";

export type CameraContextType = {
  videoTrackManager: TrackManager;
  cameraManager: DeviceManager;
};

export const CameraContext = createContext<CameraContextType | null>(null);
