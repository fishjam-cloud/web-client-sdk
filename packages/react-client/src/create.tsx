import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PeerState, Selector, State, UseReconnection } from "./state.types";
import type { ScreenshareState } from "./types";
import type { ConnectConfig, CreateConfig } from "@fishjam-cloud/ts-client";
import type {
  DeviceManagerConfig,
  UserMediaAPI,
  CreateFishjamClient,
  FishjamContextType,
  FishjamContextProviderProps,
  UseConnect,
  TrackManager,
  PeerStateWithTracks,
} from "./types";
import { Client } from "./Client";
import { createUseSetupMediaHook } from "./useSetupMedia";
import { useScreenShare as _useScreenShare } from "./screenShareTrackManager";
import { useTrackManager } from "./trackManager";

const eventNames = [
  "socketOpen",
  "socketError",
  "socketClose",
  "authSuccess",
  "authError",
  "disconnected",
  "joined",
  "joinError",
  "peerJoined",
  "peerUpdated",
  "peerLeft",
  "reconnected",
  "reconnectionRetriesLimitReached",
  "reconnectionStarted",
  "componentAdded",
  "componentUpdated",
  "componentRemoved",
  "trackReady",
  "trackAdded",
  "trackRemoved",
  "trackUpdated",
  "bandwidthEstimationChanged",
  "encodingChanged",
  "voiceActivityChanged",
  "deviceDisabled",
  "deviceEnabled",
  "managerInitialized",
  "managerStarted",
  "deviceStopped",
  "deviceReady",
  "devicesStarted",
  "devicesReady",
  "error",
  "targetTrackEncodingRequested",
  "localTrackAdded",
  "localTrackRemoved",
  "localTrackReplaced",
  "localTrackMuted",
  "localTrackUnmuted",
  "localTrackBandwidthSet",
  "localTrackEncodingBandwidthSet",
  "localTrackEncodingEnabled",
  "localTrackEncodingDisabled",
  "localPeerMetadataChanged",
  "localTrackMetadataChanged",
  "disconnectRequested",
] as const;

/**
 * Create a client that can be used with a context.
 * Returns context provider, and two hooks to interact with the context.
 *
 * @returns ContextProvider, useSelector, useConnect
 */
export function create<PeerMetadata, TrackMetadata>(
  config?: CreateConfig<PeerMetadata, TrackMetadata>,
  deviceManagerDefaultConfig?: DeviceManagerConfig,
): CreateFishjamClient<PeerMetadata, TrackMetadata> {
  const FishjamContext = createContext<FishjamContextType<PeerMetadata, TrackMetadata> | undefined>(undefined);

  function FishjamContextProvider({ children }: FishjamContextProviderProps) {
    const memoClient = useMemo(() => {
      return new Client<PeerMetadata, TrackMetadata>({
        clientConfig: config,
        deviceManagerDefaultConfig,
      });
    }, []);

    const clientRef = useRef(memoClient);
    const mutationRef = useRef(false);

    const subscribe = useCallback((subscribeCallback: () => void) => {
      const client = clientRef.current;

      const callback = () => {
        mutationRef.current = true;
        subscribeCallback();
      };
      eventNames.forEach((eventName) => client.on(eventName, callback));

      return () => {
        eventNames.forEach((eventName) => client.removeListener(eventName, callback));
      };
    }, []);

    const lastSnapshotRef = useRef<State<PeerMetadata, TrackMetadata> | null>(null);

    const getSnapshot: () => State<PeerMetadata, TrackMetadata> = useCallback(() => {
      if (mutationRef.current || lastSnapshotRef.current === null) {
        const state = {
          remote: clientRef.current.peers,
          media: clientRef.current.media,
          bandwidthEstimation: clientRef.current.bandwidthEstimation,
          tracks: clientRef.current.peersTracks,
          local: clientRef.current.local,
          status: clientRef.current.status,
          devices: clientRef.current.devices,
          client: clientRef.current,
          reconnectionStatus: clientRef.current.reconnectionStatus,
        } satisfies State<PeerMetadata, TrackMetadata>;

        lastSnapshotRef.current = state;
        mutationRef.current = false;
      }

      return lastSnapshotRef.current;
    }, []);

    const state = useSyncExternalStore(subscribe, getSnapshot);

    const tsClient = state.client.getTsClient();

    const screenshareState = useState<ScreenshareState>(null);

    const videoTrackManager = useTrackManager({
      mediaManager: state.client.videoDeviceManager,
      tsClient,
    });

    const audioTrackManager = useTrackManager({
      mediaManager: state.client.audioDeviceManager,
      tsClient,
    });

    return (
      <FishjamContext.Provider value={{ state, screenshareState, videoTrackManager, audioTrackManager }}>
        {children}
      </FishjamContext.Provider>
    );
  }

  function useFishjamContext(): FishjamContextType<PeerMetadata, TrackMetadata> {
    const context = useContext(FishjamContext);
    if (!context) throw new Error("useFishjamContext must be used within a FishjamContextProvider");
    return context;
  }

  function useSelector<Result>(selector: Selector<PeerMetadata, TrackMetadata, Result>): Result {
    const { state } = useFishjamContext();

    return useMemo(() => selector(state), [selector, state]);
  }

  function useConnect(): UseConnect<PeerMetadata> {
    const { state }: FishjamContextType<PeerMetadata, TrackMetadata> = useFishjamContext();

    return useMemo(() => {
      return (config: ConnectConfig<PeerMetadata>): (() => void) => {
        state.client.connect(config);
        return () => {
          state.client.disconnect();
        };
      };
    }, [state.client]);
  }

  function useDisconnect() {
    const { state }: FishjamContextType<PeerMetadata, TrackMetadata> = useFishjamContext();

    return useCallback(() => {
      state.client.disconnect();
    }, [state.client]);
  }

  function useStatus() {
    return useSelector((s) => s.status);
  }

  function useTracks() {
    return useSelector((s) => s.tracks);
  }

  function useClient() {
    return useSelector((s) => s.client);
  }

  function useCamera(): UserMediaAPI & TrackManager<TrackMetadata> {
    const { state, videoTrackManager } = useFishjamContext();
    return { ...state.devices.camera, ...videoTrackManager };
  }

  function useMicrophone(): UserMediaAPI & TrackManager<TrackMetadata> {
    const { state, audioTrackManager } = useFishjamContext();
    return { ...state.devices.microphone, ...audioTrackManager };
  }

  function useReconnection(): UseReconnection {
    const { state } = useFishjamContext();

    return {
      status: state.reconnectionStatus,
      isReconnecting: state.reconnectionStatus === "reconnecting",
      isError: state.reconnectionStatus === "error",
      isIdle: state.reconnectionStatus === "idle",
    };
  }

  function getPeerWithDistinguishedTracks(
    peerState: PeerState<PeerMetadata, TrackMetadata>,
  ): PeerStateWithTracks<PeerMetadata, TrackMetadata> {
    const localTracks = Object.values(peerState.tracks ?? {});

    const videoTracks = localTracks.filter(({ track }) => track?.kind === "video");
    const audioTracks = localTracks.filter(({ track }) => track?.kind === "audio");

    return { ...peerState, videoTracks, audioTracks };
  }

  function useParticipants() {
    const { state } = useFishjamContext();

    const localParticipant: PeerStateWithTracks<PeerMetadata, TrackMetadata> | null = state.local
      ? getPeerWithDistinguishedTracks(state.local)
      : null;

    const participants: PeerStateWithTracks<PeerMetadata, TrackMetadata>[] = Object.values(state.remote).map(
      getPeerWithDistinguishedTracks,
    );

    return { localParticipant, participants };
  }

  function useScreenShare() {
    const { state, screenshareState } = useFishjamContext();

    return _useScreenShare(screenshareState, state.client.getTsClient());
  }

  return {
    FishjamContextProvider,
    useSelector,
    useConnect,
    useDisconnect,
    useStatus,
    useTracks,
    useSetupMedia: createUseSetupMediaHook(useFishjamContext),
    useParticipants,
    useScreenShare,
    useCamera,
    useMicrophone,
    useClient,
    useReconnection,
  };
}
