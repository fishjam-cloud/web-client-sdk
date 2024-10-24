import { useRef, type PropsWithChildren } from "react";
import { useTrackManager } from "./hooks/useTrackManager";
import type { PeerMetadata, TrackMetadata } from "./types/internal";
import { FishjamClient, type ReconnectConfig } from "@fishjam-cloud/ts-client";
import type { FishjamContextType } from "./hooks/useFishjamContext";
import { FishjamContext } from "./hooks/useFishjamContext";
import { DeviceManager } from "./DeviceManager";
import { usePeerStatus } from "./hooks/usePeerStatus";
import { useFishjamClientState } from "./hooks/useFishjamClientState";
import { AUDIO_TRACK_CONSTRAINTS, VIDEO_TRACK_CONSTRAINTS } from "./constraints";
import type { BandwidthLimits, PersistLastDeviceHandlers, StartStreamingProps } from "./types/public";
import { useScreenShareManager } from "./hooks/useScreenShare";
import { mergeWithDefaultBandwitdthLimits } from "./utils/bandwidth";

interface FishjamProviderProps extends PropsWithChildren {
  reconnect?: ReconnectConfig | boolean;
  constraints?: Pick<MediaStreamConstraints, "audio" | "video">;
  persistLastDevice?: boolean | PersistLastDeviceHandlers;
  bandwidthLimits?: Partial<BandwidthLimits>;
  autoStreamCamera?: StartStreamingProps | false;
  autoStreamMicrophone?: StartStreamingProps | false;
}

/**
 * @category Components
 */
export function FishjamProvider({
  children,
  reconnect,
  constraints,
  persistLastDevice,
  bandwidthLimits,
  autoStreamCamera,
  autoStreamMicrophone,
}: FishjamProviderProps) {
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

  const { peerStatus, getCurrentPeerStatus } = usePeerStatus(fishjamClientRef.current);

  const mergedBandwidthLimits = mergeWithDefaultBandwitdthLimits(bandwidthLimits);

  const videoTrackManager = useTrackManager({
    mediaManager: videoDeviceManagerRef.current,
    tsClient: fishjamClientRef.current,
    getCurrentPeerStatus,
    bandwidthLimits: mergedBandwidthLimits,
    autoStreamProps: autoStreamCamera,
  });

  const audioTrackManager = useTrackManager({
    mediaManager: audioDeviceManagerRef.current,
    tsClient: fishjamClientRef.current,
    getCurrentPeerStatus,
    bandwidthLimits: mergedBandwidthLimits,
    autoStreamProps: autoStreamMicrophone,
  });

  const screenShareManager = useScreenShareManager({ fishjamClient: fishjamClientRef.current, getCurrentPeerStatus });

  const clientState = useFishjamClientState(fishjamClientRef.current);

  const context: FishjamContextType = {
    fishjamClientRef,
    peerStatus,
    screenShareManager,
    videoTrackManager,
    audioTrackManager,
    videoDeviceManagerRef,
    audioDeviceManagerRef,
    hasDevicesBeenInitializedRef,
    clientState,
    bandwidthLimits: mergedBandwidthLimits,
  };

  return <FishjamContext.Provider value={context}>{children}</FishjamContext.Provider>;
}
