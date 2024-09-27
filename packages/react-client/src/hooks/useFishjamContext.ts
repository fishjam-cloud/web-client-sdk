import type { FishjamClient } from "@fishjam-cloud/ts-client";
import { createContext, type MutableRefObject, useContext } from "react";
import type { PeerMetadata, TrackMetadata, ScreenShareState, TrackManager } from "../types";
import type { DeviceManager } from "../DeviceManager";
import type { PeerStatus } from "../state.types";
import type { FishjamClientState } from "./useFishjamClientState";

export type FishjamContextType = {
  fishjamClientRef: MutableRefObject<FishjamClient<PeerMetadata, TrackMetadata>>;
  videoDeviceManagerRef: MutableRefObject<DeviceManager>;
  audioDeviceManagerRef: MutableRefObject<DeviceManager>;
  hasDevicesBeenInitializedRef: MutableRefObject<boolean>;
  screenShareState: [ScreenShareState, React.Dispatch<React.SetStateAction<ScreenShareState>>];
  peerStatus: PeerStatus;
  videoTrackManager: TrackManager;
  audioTrackManager: TrackManager;
  clientState: FishjamClientState;
};

export const FishjamContext = createContext<FishjamContextType | null>(null);

export function useFishjamContext() {
  const context = useContext(FishjamContext);
  if (!context) throw new Error("useFishjamContext must be used within a FishjamContextProvider");
  return context as FishjamContextType;
}
