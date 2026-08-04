import type { ClientType, FishjamClient, ReconnectConfig } from "@fishjam-cloud/ts-client";
import {
  type DeviceError as CoreDeviceError,
  type DeviceItem,
  FishjamClient as TsunamiClient,
  type IDeviceManager,
  type IDevicePersistence,
  type InitializeDevicesResult as CoreInitializeDevicesResult,
  type LocalDeviceState,
  type PlatformMediaStream,
  type PlatformMediaStreamTrack,
  type TrackDeviceController,
  type TrackMiddleware as CoreTrackMiddleware,
  type TracksMiddleware as CoreTracksMiddleware,
  WebDeviceManager,
} from "@fishjam-cloud/tsunami";
import { type PropsWithChildren, useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import { CameraContext } from "./contexts/camera";
import { CustomSourceContext } from "./contexts/customSource";
import { FishjamClientContext } from "./contexts/fishjamClient";
import { FishjamIdContext } from "./contexts/fishjamId";
import { FishjamClientStateContext } from "./contexts/fishjamState";
import { InitDevicesContext } from "./contexts/initDevices";
import { MicrophoneContext } from "./contexts/microphone";
import { PeerStatusContext } from "./contexts/peerStatus";
import { ScreenshareContext } from "./contexts/screenshare";
import { useFishjamClientState } from "./hooks/internal/useFishjamClientState";
import { usePeerStatus } from "./hooks/internal/usePeerStatus";
import type {
  CustomSourceManager,
  CustomSourceState,
  DeviceManager,
  TrackManager,
  UseScreenshareResult,
} from "./types/internal";
import type {
  BandwidthLimits,
  DeviceError,
  InitializeDevicesResult,
  PersistLastDeviceHandlers,
  StreamConfig,
  TrackMiddleware,
  TracksMiddleware,
} from "./types/public";
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
   * Configure whether to use video simulcast and which quality layers to send if so.
   */
  videoConfig?: StreamConfig;
  /**
   * Configure whether to use audio simulcast and which quality layers to send if so.
   */
  audioConfig?: StreamConfig;
  /**
   * You can get you Fishjam ID at https://fishjam.io/app
   */
  fishjamId: string;
  /**
   * Enables Fishjam SDK's debug logs in the console.
   */
  debug?: boolean;
  /**
   * Allows to provide your own FishjamClient instance from ts-client.
   */
  fishjamClient?: FishjamClient;
  /**
   * Advanced: platform device layer used for media acquisition. Defaults to
   * the browser device manager wired to `persistLastDevice`. When provided,
   * the manager owns persistence and `persistLastDevice` is ignored. Read
   * once on first render.
   */
  deviceManager?: IDeviceManager<PlatformMediaStream>;
  /**
   * Platform reported to Fishjam. Defaults to `"web"`. Read once on first
   * render.
   */
  clientType?: ClientType;
}

const asLegacyDeviceError = (error: CoreDeviceError | null): DeviceError | null =>
  error === null ? null : { name: error.name };

const asDomTrack = (track: PlatformMediaStreamTrack | null): MediaStreamTrack | null =>
  track as MediaStreamTrack | null;

const asDomStream = (stream: PlatformMediaStream | null): MediaStream | null => stream as MediaStream | null;

const asStartDeviceResult = async (
  result: Promise<[PlatformMediaStreamTrack, null] | [null, CoreDeviceError]>,
): Promise<[MediaStreamTrack, null] | [null, DeviceError]> => {
  const [track, error] = await result;
  if (error) return [null, { name: error.name }];
  return [track as MediaStreamTrack, null];
};

const asSelectDeviceResult = async (result: Promise<CoreDeviceError | undefined>): Promise<DeviceError | undefined> => {
  const error = await result;
  return error && { name: error.name };
};

const toDevicePersistence = (handlers: PersistLastDeviceHandlers): IDevicePersistence => ({
  getLastDevice: (deviceType) => {
    const device = handlers.getLastDevice(deviceType);
    return device && { deviceId: device.deviceId, label: device.label, kind: deviceType };
  },
  saveLastDevice: (deviceType, device) =>
    handlers.saveLastDevice({ deviceId: device.deviceId, label: device.label } as MediaDeviceInfo, deviceType),
});

const createWebDeviceManager = (persistLastDevice: FishjamProviderProps["persistLastDevice"]): WebDeviceManager => {
  const persistHandlers =
    persistLastDevice === false
      ? undefined
      : typeof persistLastDevice === "object"
        ? persistLastDevice
        : { getLastDevice, saveLastDevice };

  return new WebDeviceManager({ persistence: persistHandlers && toDevicePersistence(persistHandlers) });
};

/**
 * Provides the Fishjam Context.
 *
 * Device, track, and session logic lives in `@fishjam-cloud/tsunami`; this
 * provider adapts the core client's store snapshots into the context shapes
 * the hooks render from.
 *
 * @category Components
 */
export function FishjamProvider(props: FishjamProviderProps) {
  const fishjamClientRef = useRef<TsunamiClient | null>(null);
  if (fishjamClientRef.current === null) {
    fishjamClientRef.current = new TsunamiClient({
      reconnect: props.reconnect,
      debug: props.debug,
      clientType: props.clientType,
      signallingClient: props.fishjamClient,
      deviceManager: props.deviceManager ?? createWebDeviceManager(props.persistLastDevice),
      videoConstraints: props.constraints?.video,
      audioConstraints: props.constraints?.audio,
      bandwidthLimits: props.bandwidthLimits,
      videoStreamConfig: props.videoConfig,
      audioStreamConfig: props.audioConfig,
    });
  }
  const client = fishjamClientRef.current;
  const devices = client.devices;
  if (!devices) throw Error("FishjamProvider always injects a device manager");

  const clientState = useSyncExternalStore(client.subscribe, client.getState);
  const peerStatus = usePeerStatus(client);

  const buildDeviceManager = useCallback(
    (
      controller: TrackDeviceController,
      deviceState: LocalDeviceState,
      deviceList: DeviceItem[],
      deviceError: CoreDeviceError | null,
    ): DeviceManager => ({
      startDevice: (deviceId) => asStartDeviceResult(controller.startDevice(deviceId ?? undefined)),
      stopDevice: () => controller.stopDevice(),
      selectDevice: (deviceId) => asStartDeviceResult(controller.startDevice(deviceId)),
      activeDevice: deviceState.activeDevice,
      deviceTrack: asDomTrack(deviceState.track),
      deviceList,
      deviceEnabled: deviceState.isEnabled,
      enableDevice: () => controller.enableDevice(),
      disableDevice: () => controller.disableDevice(),
      currentMiddleware: deviceState.middleware as TrackMiddleware,
      applyMiddleware: (middleware) => controller.applyMiddleware(middleware as CoreTrackMiddleware).then(asDomTrack),
      deviceError: asLegacyDeviceError(deviceError),
      selectedDevice: (deviceState.selectedDevice as unknown as MediaDeviceInfo) ?? null,
    }),
    [],
  );

  const buildTrackManager = useCallback(
    (controller: TrackDeviceController, deviceState: LocalDeviceState): TrackManager => ({
      selectDevice: (deviceId) => asSelectDeviceResult(controller.selectDevice(deviceId)),
      stopDevice: () => controller.stopDevice(),
      startDevice: (deviceId) => asStartDeviceResult(controller.startDevice(deviceId ?? undefined)),
      deviceTrack: asDomTrack(deviceState.track),
      currentMiddleware: deviceState.middleware as TrackMiddleware,
      setTrackMiddleware: (middleware) => controller.setTrackMiddleware(middleware as CoreTrackMiddleware),
      toggleMute: () => controller.toggleMute(),
      toggleDevice: () => asSelectDeviceResult(controller.toggleDevice()),
    }),
    [],
  );

  const cameraContext = useMemo(
    () => ({
      videoTrackManager: buildTrackManager(devices.camera, clientState.camera),
      cameraManager: buildDeviceManager(
        devices.camera,
        clientState.camera,
        clientState.availableCameras,
        clientState.cameraError,
      ),
    }),
    [
      buildTrackManager,
      buildDeviceManager,
      devices,
      clientState.camera,
      clientState.availableCameras,
      clientState.cameraError,
    ],
  );

  const microphoneContext = useMemo(
    () => ({
      audioTrackManager: buildTrackManager(devices.microphone, clientState.microphone),
      microphoneManager: buildDeviceManager(
        devices.microphone,
        clientState.microphone,
        clientState.availableMicrophones,
        clientState.microphoneError,
      ),
    }),
    [
      buildTrackManager,
      buildDeviceManager,
      devices,
      clientState.microphone,
      clientState.availableMicrophones,
      clientState.microphoneError,
    ],
  );

  const initializeDevices = useCallback(
    async (settings?: { enableVideo?: boolean; enableAudio?: boolean }): Promise<InitializeDevicesResult> => {
      const result: CoreInitializeDevicesResult = await client.initializeDevices(settings);
      return {
        status: result.status,
        stream: result.stream as MediaStream | null,
        errors: result.errors && {
          audio: asLegacyDeviceError(result.errors.audio),
          video: asLegacyDeviceError(result.errors.video),
        },
      };
    },
    [client],
  );

  const screenShareManager: UseScreenshareResult = useMemo(
    () => ({
      startStreaming: (constraints) => client.startScreenShare(constraints),
      stopStreaming: () => client.stopScreenShare(),
      stream: asDomStream(clientState.screenShare.stream),
      videoTrack: asDomTrack(clientState.screenShare.videoTrack),
      audioTrack: asDomTrack(clientState.screenShare.audioTrack),
      currentTracksMiddleware: clientState.screenShare.middleware as TracksMiddleware | null,
      setTracksMiddleware: (middleware) =>
        client.setScreenShareTracksMiddleware(middleware as CoreTracksMiddleware | null),
    }),
    [client, clientState.screenShare],
  );

  const customSourceManager: CustomSourceManager = useMemo(
    () => ({
      setStream: (sourceId, stream) => client.setCustomSource(sourceId, stream),
      getSource: (sourceId) => clientState.customSources[sourceId] as CustomSourceState | undefined,
    }),
    [client, clientState.customSources],
  );

  const fishjamClientState = useFishjamClientState(client);

  return (
    <FishjamClientContext.Provider value={fishjamClientRef as React.RefObject<TsunamiClient>}>
      <FishjamClientStateContext.Provider value={fishjamClientState}>
        <FishjamIdContext.Provider value={props.fishjamId}>
          <InitDevicesContext.Provider value={initializeDevices}>
            <PeerStatusContext.Provider value={peerStatus}>
              <CameraContext.Provider value={cameraContext}>
                <MicrophoneContext.Provider value={microphoneContext}>
                  <ScreenshareContext.Provider value={screenShareManager}>
                    <CustomSourceContext.Provider value={customSourceManager}>
                      {props.children}
                    </CustomSourceContext.Provider>
                  </ScreenshareContext.Provider>
                </MicrophoneContext.Provider>
              </CameraContext.Provider>
            </PeerStatusContext.Provider>
          </InitDevicesContext.Provider>
        </FishjamIdContext.Provider>
      </FishjamClientStateContext.Provider>
    </FishjamClientContext.Provider>
  );
}
