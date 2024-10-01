import { useRef, useState, type PropsWithChildren } from "react";
import { useTrackManager } from "./hooks/useTrackManager";
import type { PeerMetadata, ScreenShareState, TrackMetadata } from "./types/internal";
import { FishjamClient, type ReconnectConfig } from "@fishjam-cloud/ts-client";
import type { FishjamContextType } from "./hooks/useFishjamContext";
import { FishjamContext } from "./hooks/useFishjamContext";
import { DeviceManager } from "./DeviceManager";
import { usePeerStatus } from "./hooks/usePeerStatus";
import { useFishjamClientState } from "./hooks/useFishjamClientState";
import { AUDIO_TRACK_CONSTRAINTS, VIDEO_TRACK_CONSTRAINTS } from "./constraints";
import type { PersistLastDeviceHandlers } from "./types/public";

interface FishjamProviderProps extends PropsWithChildren {
  reconnect?: ReconnectConfig | boolean;
  constraints?: Pick<MediaStreamConstraints, "audio" | "video">;
  persistLastDevice?: boolean | PersistLastDeviceHandlers;
}

/**
 * @category Components
 */
export function FishjamProvider({ children, reconnect, constraints, persistLastDevice }: FishjamProviderProps) {
  const fishjamClientRef = useRef(new FishjamClient<PeerMetadata, TrackMetadata>({ reconnect }));

  const hasDevicesBeenInitializedRef = useRef(false);
  const storage = persistLastDevice;

  const videoDeviceManagerRef = useRef(
    new DeviceManager({
      deviceType: "video",
      defaultConstraints: VIDEO_TRACK_CONSTRAINTS,
      userConstraints: constraints?.video,
      storage,
    }),
  );

  const audioDeviceManagerRef = useRef(
    new DeviceManager({
      deviceType: "audio",
      defaultConstraints: AUDIO_TRACK_CONSTRAINTS,
      userConstraints: constraints?.audio,
      storage,
    }),
  );

  const screenShareState = useState<ScreenShareState>({ stream: null, trackIds: null });
  const { peerStatus, getCurrentPeerStatus } = usePeerStatus(fishjamClientRef.current);

  const videoTrackManager = useTrackManager({
    mediaManager: videoDeviceManagerRef.current,
    tsClient: fishjamClientRef.current,
    getCurrentPeerStatus,
  });

  const audioTrackManager = useTrackManager({
    mediaManager: audioDeviceManagerRef.current,
    tsClient: fishjamClientRef.current,
    getCurrentPeerStatus,
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
