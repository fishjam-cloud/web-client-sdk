import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PeerState, Selector, State, UseReconnection } from "./state.types";
import type {
  ConnectConfig,
  CreateFishjamClient,
  DeviceManagerConfig,
  FishjamContextType,
  PeerMetadata,
  PeerStateWithTracks,
  ScreenshareState,
  TrackManager,
  TrackMetadata,
  UseConnect,
  UserMediaAPI,
} from "./types";
import type { CreateConfig } from "@fishjam-cloud/ts-client";
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
export function create(
  config?: CreateConfig<PeerMetadata, TrackMetadata>,
  deviceManagerDefaultConfig?: DeviceManagerConfig,
): CreateFishjamClient {
  const FishjamContext = createContext<FishjamContextType | undefined>(undefined);

  function FishjamContextProvider({ children }: React.PropsWithChildren) {
    const memoClient = useMemo(() => new Client({ clientConfig: config, deviceManagerDefaultConfig }), []);

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

    const lastSnapshotRef = useRef<State | null>(null);

    const getSnapshot: () => State = useCallback(() => {
      if (mutationRef.current || lastSnapshotRef.current === null) {
        lastSnapshotRef.current = {
          remote: clientRef.current.peers,
          media: clientRef.current.media,
          bandwidthEstimation: clientRef.current.bandwidthEstimation,
          tracks: clientRef.current.peersTracks,
          local: clientRef.current.local,
          status: clientRef.current.status,
          devices: clientRef.current.devices,
          client: clientRef.current,
          reconnectionStatus: clientRef.current.reconnectionStatus,
        };
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

  function useFishjamContext(): FishjamContextType {
    const context = useContext(FishjamContext);
    if (!context) throw new Error("useFishjamContext must be used within a FishjamContextProvider");
    return context;
  }

  function useSelector<Result>(selector: Selector<Result>): Result {
    const { state } = useFishjamContext();

    return useMemo(() => selector(state), [selector, state]);
  }

  function useConnect(): UseConnect {
    const { state }: FishjamContextType = useFishjamContext();

    return useMemo(() => {
      return (config: ConnectConfig): (() => void) => {
        state.client.connect(config);
        return () => {
          state.client.disconnect();
        };
      };
    }, [state.client]);
  }

  function useDisconnect() {
    const { state }: FishjamContextType = useFishjamContext();

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

  function useCamera(): UserMediaAPI & TrackManager {
    const { state, videoTrackManager } = useFishjamContext();
    return { ...state.devices.camera, ...videoTrackManager };
  }

  function useMicrophone(): UserMediaAPI & TrackManager {
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

  function getPeerWithDistinguishedTracks(peerState: PeerState): PeerStateWithTracks {
    const localTracks = Object.values(peerState.tracks ?? {});

    const videoTracks = localTracks.filter(({ track }) => track?.kind === "video");
    const audioTracks = localTracks.filter(({ track }) => track?.kind === "audio");

    return { ...peerState, videoTracks, audioTracks };
  }

  function useParticipants() {
    const { state } = useFishjamContext();

    const localParticipant: PeerStateWithTracks | null = state.local
      ? getPeerWithDistinguishedTracks(state.local)
      : null;

    const participants: PeerStateWithTracks[] = Object.values(state.remote).map(getPeerWithDistinguishedTracks);

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
