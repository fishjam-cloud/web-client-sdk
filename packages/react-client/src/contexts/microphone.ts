import { createContext } from "react";

import type { NewDeviceApi } from "../hooks/internal/device/useDevice";
import type { TrackManager } from "../types/internal";

export type MicrophoneContextType = {
  audioTrackManager: TrackManager;
  microphone: NewDeviceApi;
};

export const MicrophoneContext = createContext<MicrophoneContextType | null>(null);
