import type { FishjamClient } from "@fishjam-cloud/ts-client";
import { createContext, type MutableRefObject, useContext } from "react";

import type { DeviceManager } from "../../devices/DeviceManager";
import type { TrackManager } from "../../types/internal";
import type { BandwidthLimits, PeerStatus } from "../../types/public";
import type { FishjamClientState } from "./useFishjamClientState";
import type { UseScreenshareResult } from "./useScreenshareManager";

export type FishjamContextType = {
  fishjamClientRef: MutableRefObject<FishjamClient>;
  videoDeviceManagerRef: MutableRefObject<DeviceManager>;
  audioDeviceManagerRef: MutableRefObject<DeviceManager>;
  hasDevicesBeenInitializedRef: MutableRefObject<boolean>;
  screenShareManager: UseScreenshareResult;
  peerStatus: PeerStatus;
  videoTrackManager: TrackManager;
  audioTrackManager: TrackManager;
  clientState: FishjamClientState;
  bandwidthLimits: BandwidthLimits;
};

export const FishjamContext = createContext<FishjamContextType | null>(null);

export function useFishjamContext() {
  const context = useContext(FishjamContext);
  if (!context) throw new Error("useFishjamContext must be used within a FishjamContextProvider");
  return context as FishjamContextType;
}
