import { createContext } from "react";

import type { DeviceManager } from "../hooks/internal/device/useDevice";
import type { TrackManager } from "../types/internal";

export type MicrophoneContextType = {
  audioTrackManager: TrackManager;
  microphone: DeviceManager;
};

export const MicrophoneContext = createContext<MicrophoneContextType | null>(null);
