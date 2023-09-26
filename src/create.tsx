import { createContext, Dispatch, JSX, ReactNode, useCallback, useContext, useMemo, useReducer } from "react";
import type { Selector, State } from "./state.types";
import { PeerStatus, TrackId, TrackWithOrigin } from "./state.types";
import { createEmptyApi, DEFAULT_STORE } from "./state";
import { Api } from "./api";
import { Config, JellyfishClient } from "@jellyfish-dev/ts-client-sdk";
import { INITIAL_STATE } from "./useUserMedia";
import { Action, createDefaultDevices, Reducer, reducer } from "./reducer";
import { useSetupCameraAndMicrophone as useSetupCameraAndMicrophoneInternal } from "./useCameraAndMicrophone";
import {
  UseCameraAndMicrophoneResult,
  UseCameraResult,
  UseMicrophoneResult,
  UseSetupCameraAndMicrophoneConfig,
  UseSetupCameraAndMicrophoneResult,
} from "./useCameraAndMicrophone/types";

export type JellyfishContextProviderProps = {
  children: ReactNode;
};

type JellyfishContextType<PeerMetadata, TrackMetadata> = {
  state: State<PeerMetadata, TrackMetadata>;
  dispatch: Dispatch<Action<PeerMetadata, TrackMetadata>>;
};

export type UseConnect<PeerMetadata> = (config: Config<PeerMetadata>) => () => void;

export const createDefaultState = <PeerMetadata, TrackMetadata>(): State<PeerMetadata, TrackMetadata> => ({
  local: null,
  remote: {},
  status: null,
  tracks: {},
  bandwidthEstimation: BigInt(0), // todo investigate bigint n notation
  media: INITIAL_STATE,
  devices: createDefaultDevices(),
  connectivity: {
    api: null,
    client: new JellyfishClient<PeerMetadata, TrackMetadata>(),
  },
});

export type CreateJellyfishClient<PeerMetadata, TrackMetadata> = {
  JellyfishContextProvider: ({ children }: JellyfishContextProviderProps) => JSX.Element;
  useConnect: () => (config: Config<PeerMetadata>) => () => void;
  useDisconnect: () => () => void;
  useApi: () => Api<TrackMetadata>;
  useStatus: () => PeerStatus;
  useSelector: <Result>(selector: Selector<PeerMetadata, TrackMetadata, Result>) => Result;
  useTracks: () => Record<TrackId, TrackWithOrigin<TrackMetadata>>;
  useSetupCameraAndMicrophone: (
    config: UseSetupCameraAndMicrophoneConfig<TrackMetadata>
  ) => UseSetupCameraAndMicrophoneResult;
  useCamera: () => UseCameraAndMicrophoneResult<TrackMetadata>["camera"];
  useMicrophone: () => UseCameraAndMicrophoneResult<TrackMetadata>["microphone"];
};

/**
 * Create a client that can be used with a context.
 * Returns context provider, and two hooks to interact with the context.
 *
 * @returns ContextProvider, useSelector, useConnect
 */
export const create = <PeerMetadata, TrackMetadata>(): CreateJellyfishClient<PeerMetadata, TrackMetadata> => {
  const JellyfishContext = createContext<JellyfishContextType<PeerMetadata, TrackMetadata> | undefined>(undefined);

  const JellyfishContextProvider: ({ children }: JellyfishContextProviderProps) => JSX.Element = ({
    children,
  }: JellyfishContextProviderProps) => {
    const [state, dispatch] = useReducer<Reducer<PeerMetadata, TrackMetadata>, State<PeerMetadata, TrackMetadata>>(
      reducer,
      DEFAULT_STORE,
      () => createDefaultState()
    );

    return <JellyfishContext.Provider value={{ state, dispatch }}>{children}</JellyfishContext.Provider>;
  };

  const useJellyfishContext = (): JellyfishContextType<PeerMetadata, TrackMetadata> => {
    const context = useContext(JellyfishContext);
    if (!context) throw new Error("useJellyfishContext must be used within a JellyfishContextProvider");
    return context;
  };

  const useSelector = <Result,>(selector: Selector<PeerMetadata, TrackMetadata, Result>): Result => {
    const { state } = useJellyfishContext();

    return useMemo(() => selector(state), [selector, state]);
  };

  const useConnect = (): UseConnect<PeerMetadata> => {
    const { dispatch }: JellyfishContextType<PeerMetadata, TrackMetadata> = useJellyfishContext();

    return useMemo(() => {
      return (config: Config<PeerMetadata>): (() => void) => {
        dispatch({ type: "connect", config, dispatch });
        return () => {
          dispatch({ type: "disconnect" });
        };
      };
    }, [dispatch]);
  };

  const useDisconnect = () => {
    const { dispatch }: JellyfishContextType<PeerMetadata, TrackMetadata> = useJellyfishContext();

    return useCallback(() => {
      dispatch({ type: "disconnect" });
    }, [dispatch]);
  };

  const useApi = () => useSelector((s) => s.connectivity.api || createEmptyApi<TrackMetadata>());
  const useStatus = () => useSelector((s) => s.status);
  const useTracks = () => useSelector((s) => s.tracks);

  const useCamera = (): UseCameraResult<TrackMetadata> => {
    const { state } = useJellyfishContext();

    return state.devices.camera;
  };

  const useMicrophone = (): UseMicrophoneResult<TrackMetadata> => {
    const { state } = useJellyfishContext();

    return state.devices.microphone;
  };

  const useSetupCameraAndMicrophone = (
    config: UseSetupCameraAndMicrophoneConfig<TrackMetadata>
  ): UseSetupCameraAndMicrophoneResult => {
    const { state, dispatch } = useJellyfishContext();

    return useSetupCameraAndMicrophoneInternal(state, dispatch, config);
  };

  return {
    JellyfishContextProvider,
    useSelector,
    useConnect,
    useDisconnect,
    useApi,
    useStatus,
    useTracks,
    useSetupCameraAndMicrophone,
    useCamera,
    useMicrophone,
  };
};
