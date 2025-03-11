import { createContext, useContext } from "react";

import type { TrackManager } from "../../../types/internal";
import type { NewDeviceApi } from "../device/useDevice";

export type MicrophoneContextType = {
  audioTrackManager: TrackManager;
  microphone: NewDeviceApi;
};

export const MicrophoneContext = createContext<MicrophoneContextType | null>(null);

export function useMicrophoneContext() {
  const context = useContext(MicrophoneContext);
  if (!context) throw new Error("useMicrophoneContext must be used within a MicrophoneProvider");
  return context as MicrophoneContextType;
}
