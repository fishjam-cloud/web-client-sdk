import { FishjamClient, type ReconnectConfig } from "@fishjam-cloud/ts-client";
import { type PropsWithChildren, useRef } from "react";

import { AUDIO_TRACK_CONSTRAINTS, VIDEO_TRACK_CONSTRAINTS } from "./devices/constraints";
import { DeviceManager } from "./devices/DeviceManager";
import { useFishjamClientState } from "./hooks/internal/useFishjamClientState";
import type { FishjamContextType } from "./hooks/internal/useFishjamContext";
import { FishjamContext } from "./hooks/internal/useFishjamContext";
import { usePeerStatus } from "./hooks/internal/usePeerStatus";
import { useScreenShareManager } from "./hooks/internal/useScreenshareManager";
import { useTrackManager } from "./hooks/internal/useTrackManager";
import type { BandwidthLimits, PersistLastDeviceHandlers, StreamConfig } from "./types/public";
import { mergeWithDefaultBandwitdthLimits } from "./utils/bandwidth";

/**
 * @category Components
 */
export interface FishjamProviderProps extends PropsWithChildren {
  /**
   * Use {@link ReconnectConfig} to adjust reconnection policy to your needs or set false it.
   * Set to true by default.
   */
  reconnect?: ReconnectConfig | boolean;
  /**
   * Set preferred constraints.
   * @param {MediaStreamConstraints} constraints - The media stream constraints as defined by the Web API.
   * @see {@link https://udn.realityripple.com/docs/Web/API/MediaStreamConstraints MediaStreamConstraints}
   */
  constraints?: Pick<MediaStreamConstraints, "audio" | "video">;
  /**
   * Decide if you want Fishjam SDK to persist last used device in the local storage.
   * You can also provide your getter and setter by using the {@link PersistLastDeviceHandlers} interface.
   */
  persistLastDevice?: boolean | PersistLastDeviceHandlers;
  /**
   * Adjust max bandwidth limit for a single stream and simulcast.
   */
  bandwidthLimits?: Partial<BandwidthLimits>;
  /**
   * Configure whether to use video simulcast and which layers to send if so.
   */
  videoConfig?: StreamConfig;
  /**
   * Configure whether to use audio simulcast and which layers to send if so.
   */
  audioConfig?: StreamConfig;
}

/**
 * Provides the Fishjam Context
 * @category Components
 */
export function FishjamProvider(props: FishjamProviderProps) {
  const fishjamClientRef = useRef(new FishjamClient({ reconnect: props.reconnect }));

  const hasDevicesBeenInitializedRef = useRef(false);
  const storage = props.persistLastDevice;

  const videoDeviceManagerRef = useRef(
    new DeviceManager({
      deviceType: "video",
      defaultConstraints: VIDEO_TRACK_CONSTRAINTS,
      userConstraints: props.constraints?.video,
      storage,
    }),
  );

  const audioDeviceManagerRef = useRef(
    new DeviceManager({
      deviceType: "audio",
      defaultConstraints: AUDIO_TRACK_CONSTRAINTS,
      userConstraints: props.constraints?.audio,
      storage,
    }),
  );

  const { peerStatus, getCurrentPeerStatus } = usePeerStatus(fishjamClientRef.current);

  const mergedBandwidthLimits = mergeWithDefaultBandwitdthLimits(props.bandwidthLimits);

  const videoTrackManager = useTrackManager({
    mediaManager: videoDeviceManagerRef.current,
    tsClient: fishjamClientRef.current,
    getCurrentPeerStatus,
    bandwidthLimits: mergedBandwidthLimits,
    streamConfig: props.videoConfig,
  });

  const audioTrackManager = useTrackManager({
    mediaManager: audioDeviceManagerRef.current,
    tsClient: fishjamClientRef.current,
    getCurrentPeerStatus,
    bandwidthLimits: mergedBandwidthLimits,
    streamConfig: props.audioConfig,
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

  return <FishjamContext.Provider value={context}>{props.children}</FishjamContext.Provider>;
}
