import type { FishjamClient } from "@fishjam-cloud/ts-client";
import { createContext, type MutableRefObject, useContext } from "react";
import type { PeerMetadata, TrackMetadata, ScreenshareState, TrackManager } from "../types";
import type { DeviceManager } from "../DeviceManager";
import type { PeerStatus } from "../state.types";

export type FishjamContextType = {
  fishjamClientRef: MutableRefObject<FishjamClient<PeerMetadata, TrackMetadata>>;
  videoDeviceManagerRef: MutableRefObject<DeviceManager>;
  audioDeviceManagerRef: MutableRefObject<DeviceManager>;
  hasDevicesBeenInitializedRef: MutableRefObject<boolean>;
  screenshareState: [ScreenshareState, React.Dispatch<React.SetStateAction<ScreenshareState>>];
  peerStatusState: readonly [PeerStatus, React.Dispatch<React.SetStateAction<PeerStatus>>];
  videoTrackManager: TrackManager;
  audioTrackManager: TrackManager;
};

export const FishjamContext = createContext<FishjamContextType | null>(null);

export function useFishjamContext() {
  const context = useContext(FishjamContext);
  if (!context) throw new Error("useFishjamContext must be used within a FishjamContextProvider");
  return context as FishjamContextType;
}
