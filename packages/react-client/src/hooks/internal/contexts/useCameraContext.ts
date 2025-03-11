import { createContext, useContext } from "react";

import type { TrackManager } from "../../../types/internal";
import type { NewDeviceApi } from "../device/useDevice";

export type CameraContextType = {
  videoTrackManager: TrackManager;
  camera: NewDeviceApi;
};

export const CameraContext = createContext<CameraContextType | null>(null);

export function useCameraContext() {
  const context = useContext(CameraContext);
  if (!context) throw new Error("useCameraContext must be used within a FishjamProvider");
  return context as CameraContextType;
}
