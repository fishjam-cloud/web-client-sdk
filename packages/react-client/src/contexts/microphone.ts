import { createContext } from "react";

import type { DeviceManager } from "../hooks/internal/devices/useDeviceManager";
import type { TrackManager } from "../types/internal";

export type MicrophoneContextType = {
  audioTrackManager: TrackManager;
  microphoneManager: DeviceManager;
};

export const MicrophoneContext = createContext<MicrophoneContextType | null>(null);
