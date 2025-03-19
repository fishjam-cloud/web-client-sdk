import { FishjamClient, type ReconnectConfig } from "@fishjam-cloud/ts-client";
import { type PropsWithChildren, useMemo, useRef } from "react";

import { CameraContext } from "./contexts/camera";
import { FishjamClientContext } from "./contexts/fishjamClient";
import { FishjamClientStateContext } from "./contexts/fishjamState";
import { InitDevicesContext } from "./contexts/initDevices";
import { MicrophoneContext } from "./contexts/microphone";
import { PeerStatusContext } from "./contexts/peerStatus";
import { ScreenshareContext } from "./contexts/screenshare";
import { AUDIO_TRACK_CONSTRAINTS, VIDEO_TRACK_CONSTRAINTS } from "./devices/constraints";
import { useMediaDevices } from "./hooks/internal/devices/useMediaDevices";
import { useFishjamClientState } from "./hooks/internal/useFishjamClientState";
import { usePeerStatus } from "./hooks/internal/usePeerStatus";
import { useScreenShareManager } from "./hooks/internal/useScreenshareManager";
import { useTrackManager } from "./hooks/internal/useTrackManager";
import type { BandwidthLimits, PersistLastDeviceHandlers, StreamConfig } from "./types/public";
import { mergeWithDefaultBandwitdthLimits } from "./utils/bandwidth";
import { getLastDevice, saveLastDevice } from "./utils/localStorage";

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

  const persistHandlers = useMemo(() => {
    if (props.persistLastDevice === false) return undefined;

    if (typeof props.persistLastDevice === "object") return props.persistLastDevice;

    return { getLastDevice, saveLastDevice };
  }, [props.persistLastDevice]);

  const { cameraManager, microphoneManager, initializeDevices } = useMediaDevices({
    videoConstraints: props.constraints?.video ?? VIDEO_TRACK_CONSTRAINTS,
    audioConstraints: props.constraints?.audio ?? AUDIO_TRACK_CONSTRAINTS,
    persistHandlers,
  });

  const peerStatus = usePeerStatus(fishjamClientRef.current);

  const mergedBandwidthLimits = useMemo(
    () => mergeWithDefaultBandwitdthLimits(props.bandwidthLimits),
    [props.bandwidthLimits],
  );

  const videoTrackManager = useTrackManager({
    tsClient: fishjamClientRef.current,
    peerStatus,
    deviceManager: cameraManager,
    bandwidthLimits: mergedBandwidthLimits,
    streamConfig: props.videoConfig,
    type: "camera",
  });

  const audioTrackManager = useTrackManager({
    tsClient: fishjamClientRef.current,
    peerStatus,
    deviceManager: microphoneManager,
    bandwidthLimits: mergedBandwidthLimits,
    streamConfig: props.audioConfig,
    type: "microphone",
  });

  const screenShareManager = useScreenShareManager({
    fishjamClient: fishjamClientRef.current,
    peerStatus,
  });

  const cameraContext = useMemo(() => ({ videoTrackManager, cameraManager }), [videoTrackManager, cameraManager]);
  const microphoneContext = useMemo(
    () => ({ audioTrackManager, microphoneManager }),
    [audioTrackManager, microphoneManager],
  );

  const fishjamClientState = useFishjamClientState(fishjamClientRef.current);

  return (
    <FishjamClientContext.Provider value={fishjamClientRef}>
      <FishjamClientStateContext.Provider value={fishjamClientState}>
        <InitDevicesContext.Provider value={initializeDevices}>
          <PeerStatusContext.Provider value={peerStatus}>
            <CameraContext.Provider value={cameraContext}>
              <MicrophoneContext.Provider value={microphoneContext}>
                <ScreenshareContext.Provider value={screenShareManager}>{props.children}</ScreenshareContext.Provider>
              </MicrophoneContext.Provider>
            </CameraContext.Provider>
          </PeerStatusContext.Provider>
        </InitDevicesContext.Provider>
      </FishjamClientStateContext.Provider>
    </FishjamClientContext.Provider>
  );
}
