import { createContext } from "react";

import type { DeviceManager, TrackManager } from "../types/internal";

export type CameraContextType = {
  videoTrackManager: TrackManager;
  cameraManager: DeviceManager;
};

export const CameraContext = createContext<CameraContextType | null>(null);
