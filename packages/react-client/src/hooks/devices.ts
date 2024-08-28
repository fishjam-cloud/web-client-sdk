import { useFishjamContext } from "./fishjamContext";
import type { UserMediaAPI, TrackManager } from "../types";

export function useCamera(): UserMediaAPI & TrackManager {
  const { state, videoTrackManager } = useFishjamContext();
  return { ...state.devices.camera, ...videoTrackManager };
}

export function useMicrophone(): UserMediaAPI & TrackManager {
  const { state, audioTrackManager } = useFishjamContext();
  return { ...state.devices.microphone, ...audioTrackManager };
}
