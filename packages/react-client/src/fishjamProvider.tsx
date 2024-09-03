import { useRef, useState, type PropsWithChildren } from "react";
import { useTrackManager } from "./hooks/trackManager";
import type { DeviceManagerConfig, PeerMetadata, ScreenshareState, TrackMetadata } from "./types";
import { FishjamClient, type ReconnectConfig } from "@fishjam-cloud/ts-client";
import { FishjamContext } from "./hooks/fishjamContext";
import { DeviceManager } from "./DeviceManager";
import { usePeerStatus } from "./hooks/peerStatus";

interface FishjamProviderProps extends PropsWithChildren {
  config?: { reconnect?: ReconnectConfig | boolean };
  deviceManagerDefaultConfig?: DeviceManagerConfig;
}

export function FishjamProvider({ children, config, deviceManagerDefaultConfig }: FishjamProviderProps) {
  const fishjamClientRef = useRef(new FishjamClient<PeerMetadata, TrackMetadata>(config));

  const hasDevicesBeenInitializedRef = useRef(false);
  const videoDeviceManagerRef = useRef(new DeviceManager("video", deviceManagerDefaultConfig));
  const audioDeviceManagerRef = useRef(new DeviceManager("audio", deviceManagerDefaultConfig));

  const screenshareState = useState<ScreenshareState>(null);
  const peerStatusState = usePeerStatus(fishjamClientRef.current);

  const videoTrackManager = useTrackManager({
    mediaManager: videoDeviceManagerRef.current,
    tsClient: fishjamClientRef.current,
  });

  const audioTrackManager = useTrackManager({
    mediaManager: audioDeviceManagerRef.current,
    tsClient: fishjamClientRef.current,
  });

  const context = {
    fishjamClientRef,
    peerStatusState,
    screenshareState,
    videoTrackManager,
    audioTrackManager,
    videoDeviceManagerRef,
    audioDeviceManagerRef,
    hasDevicesBeenInitializedRef,
  };

  return <FishjamContext.Provider value={context}>{children}</FishjamContext.Provider>;
}
