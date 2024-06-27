import type { JSX } from "react";
import { createContext, useCallback, useContext, useMemo, useRef, useSyncExternalStore } from "react";
import type { Selector, State, UseReconnection } from "./state.types";
import type { ConnectConfig, CreateConfig } from "@fishjam-dev/ts-client";
import type {
  DeviceManagerConfig,
  CameraAPI,
  MicrophoneAPI,
  ScreenShareAPI,
  CreateFishjamClient,
  FishjamContextType,
  FishjamContextProviderProps,
  UseConnect,
} from "./types";
import { Client } from "./Client";
import type { ScreenShareManagerConfig } from "./ScreenShareManager";
import { createUseSetupMediaHook } from "./useSetupMedia";

/**
 * Create a client that can be used with a context.
 * Returns context provider, and two hooks to interact with the context.
 *
 * @returns ContextProvider, useSelector, useConnect
 */
export const create = <PeerMetadata, TrackMetadata>(
  config?: CreateConfig<PeerMetadata, TrackMetadata>,
  deviceManagerDefaultConfig?: DeviceManagerConfig,
  screenShareManagerDefaultConfig?: ScreenShareManagerConfig,
): CreateFishjamClient<PeerMetadata, TrackMetadata> => {
  const FishjamContext = createContext<FishjamContextType<PeerMetadata, TrackMetadata> | undefined>(undefined);

  const FishjamContextProvider: ({ children }: FishjamContextProviderProps) => JSX.Element = ({
    children,
  }: FishjamContextProviderProps) => {
    const memoClient = useMemo(() => {
      return new Client<PeerMetadata, TrackMetadata>({
        clientConfig: config,
        deviceManagerDefaultConfig,
        screenShareManagerDefaultConfig,
      });
    }, []);

    const clientRef = useRef(memoClient);
    const mutationRef = useRef(false);

    const subscribe = useCallback((cb: () => void) => {
      const client = clientRef.current;

      const callback = () => {
        mutationRef.current = true;
        cb();
      };

      client.on("socketOpen", callback);
      client.on("socketError", callback);
      client.on("socketClose", callback);
      client.on("authSuccess", callback);
      client.on("authError", callback);
      client.on("disconnected", callback);
      client.on("joined", callback);
      client.on("joinError", callback);
      client.on("peerJoined", callback);
      client.on("peerUpdated", callback);
      client.on("peerLeft", callback);

      client.on("reconnected", callback);
      client.on("reconnectionRetriesLimitReached", callback);
      client.on("reconnectionStarted", callback);

      client.on("componentAdded", callback);
      client.on("componentUpdated", callback);
      client.on("componentRemoved", callback);

      client.on("trackReady", callback);
      client.on("trackAdded", callback);
      client.on("trackRemoved", callback);
      client.on("trackUpdated", callback);
      client.on("bandwidthEstimationChanged", callback);

      client.on("encodingChanged", callback);
      client.on("voiceActivityChanged", callback);

      client.on("deviceDisabled", callback);
      client.on("deviceEnabled", callback);
      client.on("managerInitialized", callback);
      client.on("managerStarted", callback);
      client.on("deviceStopped", callback);
      client.on("deviceReady", callback);
      client.on("devicesStarted", callback);
      client.on("devicesReady", callback);
      client.on("error", callback);

      client.on("targetTrackEncodingRequested", callback);

      client.on("localTrackAdded", callback);
      client.on("localTrackRemoved", callback);
      client.on("localTrackReplaced", callback);
      client.on("localTrackMuted", callback);
      client.on("localTrackUnmuted", callback);
      client.on("localTrackBandwidthSet", callback);
      client.on("localTrackEncodingBandwidthSet", callback);
      client.on("localTrackEncodingEnabled", callback);
      client.on("localTrackEncodingDisabled", callback);
      client.on("localEndpointMetadataChanged", callback);
      client.on("localTrackMetadataChanged", callback);

      client.on("disconnectRequested", callback);

      return () => {
        client.removeListener("socketOpen", callback);
        client.removeListener("socketError", callback);
        client.removeListener("socketClose", callback);
        client.removeListener("authSuccess", callback);
        client.removeListener("authError", callback);
        client.removeListener("disconnected", callback);
        client.removeListener("joined", callback);
        client.removeListener("joinError", callback);
        client.removeListener("peerJoined", callback);
        client.removeListener("peerUpdated", callback);
        client.removeListener("peerLeft", callback);

        client.removeListener("reconnected", callback);
        client.removeListener("reconnectionRetriesLimitReached", callback);
        client.removeListener("reconnectionStarted", callback);

        client.removeListener("componentAdded", callback);
        client.removeListener("componentUpdated", callback);
        client.removeListener("componentRemoved", callback);

        client.removeListener("trackReady", callback);
        client.removeListener("trackAdded", callback);
        client.removeListener("trackRemoved", callback);
        client.removeListener("trackUpdated", callback);
        client.removeListener("bandwidthEstimationChanged", callback);

        client.removeListener("encodingChanged", callback);
        client.removeListener("voiceActivityChanged", callback);

        client.removeListener("deviceDisabled", callback);
        client.removeListener("deviceEnabled", callback);
        client.removeListener("managerInitialized", callback);
        client.removeListener("managerStarted", callback);
        client.removeListener("deviceStopped", callback);
        client.removeListener("devicesStarted", callback);
        client.removeListener("devicesReady", callback);
        client.removeListener("error", callback);

        client.removeListener("targetTrackEncodingRequested", callback);

        client.removeListener("localTrackAdded", callback);
        client.removeListener("localTrackRemoved", callback);
        client.removeListener("localTrackReplaced", callback);
        client.removeListener("localTrackMuted", callback);
        client.removeListener("localTrackUnmuted", callback);

        client.removeListener("localTrackBandwidthSet", callback);
        client.removeListener("localTrackEncodingBandwidthSet", callback);
        client.removeListener("localTrackEncodingEnabled", callback);
        client.removeListener("localTrackEncodingDisabled", callback);
        client.removeListener("localEndpointMetadataChanged", callback);
        client.removeListener("localTrackMetadataChanged", callback);

        client.removeListener("disconnectRequested", callback);
      };
    }, []);

    const lastSnapshotRef = useRef<State<PeerMetadata, TrackMetadata> | null>(null);

    const getSnapshot: () => State<PeerMetadata, TrackMetadata> = useCallback(() => {
      if (mutationRef.current || lastSnapshotRef.current === null) {
        const state = {
          remote: clientRef.current.peers,
          screenShareManager: clientRef.current.screenShareManager,
          media: clientRef.current.media,
          bandwidthEstimation: clientRef.current.bandwidthEstimation,
          tracks: clientRef.current.peersTracks,
          local: clientRef.current.local,
          status: clientRef.current.status,
          devices: clientRef.current.devices,
          deviceManager: clientRef.current.deviceManager,
          client: clientRef.current,
          reconnectionStatus: clientRef.current.reconnectionStatus,
        };

        lastSnapshotRef.current = state;
        mutationRef.current = false;
      }

      return lastSnapshotRef.current;
    }, []);

    const state = useSyncExternalStore(subscribe, getSnapshot);

    return <FishjamContext.Provider value={{ state }}>{children}</FishjamContext.Provider>;
  };

  const useFishjamContext = (): FishjamContextType<PeerMetadata, TrackMetadata> => {
    const context = useContext(FishjamContext);
    if (!context) throw new Error("useFishjamContext must be used within a FishjamContextProvider");
    return context;
  };

  const useSelector = <Result,>(selector: Selector<PeerMetadata, TrackMetadata, Result>): Result => {
    const { state } = useFishjamContext();

    return useMemo(() => selector(state), [selector, state]);
  };

  const useConnect = (): UseConnect<PeerMetadata> => {
    const { state }: FishjamContextType<PeerMetadata, TrackMetadata> = useFishjamContext();

    return useMemo(() => {
      return (config: ConnectConfig<PeerMetadata>): (() => void) => {
        state.client.connect(config);
        return () => {
          state.client.disconnect();
        };
      };
    }, [state.client]);
  };

  const useDisconnect = () => {
    const { state }: FishjamContextType<PeerMetadata, TrackMetadata> = useFishjamContext();

    return useCallback(() => {
      state.client.disconnect();
    }, [state.client]);
  };

  const useStatus = () => useSelector((s) => s.status);
  const useTracks = () => useSelector((s) => s.tracks);
  const useClient = () => useSelector((s) => s.client);

  const useCamera = (): CameraAPI<TrackMetadata> => {
    const { state } = useFishjamContext();

    return state.devices.camera;
  };

  const useMicrophone = (): MicrophoneAPI<TrackMetadata> => {
    const { state } = useFishjamContext();

    return state.devices.microphone;
  };

  const useScreenShare = (): ScreenShareAPI<TrackMetadata> => {
    const { state } = useFishjamContext();
    return state.devices.screenShare;
  };

  const useReconnection = (): UseReconnection => {
    const { state } = useFishjamContext();

    return {
      status: state.reconnectionStatus,
      isReconnecting: state.reconnectionStatus === "reconnecting",
      isError: state.reconnectionStatus === "error",
      isIdle: state.reconnectionStatus === "idle",
    };
  };

  return {
    FishjamContextProvider,
    useSelector,
    useConnect,
    useDisconnect,
    useStatus,
    useTracks,
    useSetupMedia: createUseSetupMediaHook(useFishjamContext),
    useCamera,
    useMicrophone,
    useScreenShare,
    useClient,
    useReconnection,
  };
};
