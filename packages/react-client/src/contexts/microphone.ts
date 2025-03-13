import { createContext } from "react";

import type { DeviceApi } from "../hooks/internal/device/useDevice";
import type { TrackManager } from "../types/internal";

export type MicrophoneContextType = {
  audioTrackManager: TrackManager;
  microphone: DeviceApi;
};

export const MicrophoneContext = createContext<MicrophoneContextType | null>(null);
