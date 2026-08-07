import { createContext } from "react";

import type { DeviceManager, TrackManager } from "../types/internal";

export type MicrophoneContextType = {
  audioTrackManager: TrackManager;
  microphoneManager: DeviceManager;
};

export const MicrophoneContext = createContext<MicrophoneContextType | null>(null);
