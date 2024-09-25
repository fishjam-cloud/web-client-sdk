import { useRef, useState, type PropsWithChildren } from "react";
import { useTrackManager } from "./hooks/useTrackManager";
import type { DeviceManagerConfig, PeerMetadata, ScreenShareState, TrackMetadata } from "./types";
import { FishjamClient, type ReconnectConfig } from "@fishjam-cloud/ts-client";
import type { FishjamContextType } from "./hooks/useFishjamContext";
import { FishjamContext } from "./hooks/useFishjamContext";
import { DeviceManager } from "./DeviceManager";
import { useParticipantStatus } from "./hooks/useParticipantStatus";
import { useFishjamClientState } from "./hooks/useFishjamClientState";

interface FishjamProviderProps extends PropsWithChildren {
  config?: { reconnect?: ReconnectConfig | boolean };
  deviceManagerDefaultConfig?: DeviceManagerConfig;
}

/**
 * @category Components
 */
export function FishjamProvider({ children, config, deviceManagerDefaultConfig }: FishjamProviderProps) {
  const fishjamClientRef = useRef(new FishjamClient<PeerMetadata, TrackMetadata>(config));

  const hasDevicesBeenInitializedRef = useRef(false);
  const videoDeviceManagerRef = useRef(new DeviceManager("video", deviceManagerDefaultConfig));
  const audioDeviceManagerRef = useRef(new DeviceManager("audio", deviceManagerDefaultConfig));

  const screenShareState = useState<ScreenShareState>({ stream: null, trackIds: null });
  const { peerStatus, getCurrentParticipantStatus } = useParticipantStatus(fishjamClientRef.current);

  const videoTrackManager = useTrackManager({
    mediaManager: videoDeviceManagerRef.current,
    tsClient: fishjamClientRef.current,
    getCurrentParticipantStatus,
  });

  const audioTrackManager = useTrackManager({
    mediaManager: audioDeviceManagerRef.current,
    tsClient: fishjamClientRef.current,
    getCurrentParticipantStatus,
  });

  const clientState = useFishjamClientState(fishjamClientRef.current);

  const context: FishjamContextType = {
    fishjamClientRef,
    peerStatus,
    screenShareState,
    videoTrackManager,
    audioTrackManager,
    videoDeviceManagerRef,
    audioDeviceManagerRef,
    hasDevicesBeenInitializedRef,
    clientState,
  };

  return <FishjamContext.Provider value={context}>{children}</FishjamContext.Provider>;
}
