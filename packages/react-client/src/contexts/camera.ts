import { createContext } from "react";

import type { NewDeviceApi } from "../hooks/internal/device/useDevice";
import type { TrackManager } from "../types/internal";

export type CameraContextType = {
  videoTrackManager: TrackManager;
  camera: NewDeviceApi;
};

export const CameraContext = createContext<CameraContextType | null>(null);
