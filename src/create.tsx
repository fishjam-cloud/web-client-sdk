import { createContext, useContext, useMemo, useState } from "react";
import type { State, Selector } from "./state.types";
import { connect } from "./connect";
import { Config } from "@jellyfish-dev/ts-client-sdk";
import { DEFAULT_STORE } from "./state";

export type JellyfishContextProviderProps = {
  children: React.ReactNode;
};

type JellyfishContextType<PeerMetadata, TrackMetadata> = {
  state: State<PeerMetadata, TrackMetadata>;
  setState: (value: (prevState: State<PeerMetadata, TrackMetadata>) => State<PeerMetadata, TrackMetadata>) => void;
  // setState: (
  //   value:
  //     | ((
  //     prevState: LibraryPeersState<PeerMetadata, TrackMetadata>
  //   ) => LibraryPeersState<PeerMetadata, TrackMetadata>)
  //     | LibraryPeersState<PeerMetadata, TrackMetadata>
  // ) => void;
};

export type UseConnect<PeerMetadata> = (config: Config<PeerMetadata>) => () => void;

/**
 * Create a client that can be used with a context.
 * Returns context provider, and two hooks to interact with the context.
 *
 * @returns ContextProvider, useSelector, useConnect
 */
export const create = <PeerMetadata, TrackMetadata>() => {
  const JellyfishContext = createContext<JellyfishContextType<PeerMetadata, TrackMetadata> | undefined>(undefined);

  const JellyfishContextProvider = ({ children }: JellyfishContextProviderProps) => {
    const [state, setState] = useState<State<PeerMetadata, TrackMetadata>>(DEFAULT_STORE);

    return <JellyfishContext.Provider value={{ state, setState }}>{children}</JellyfishContext.Provider>;
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
    const { setState }: JellyfishContextType<PeerMetadata, TrackMetadata> = useJellyfishContext();

    return useMemo(() => connect(setState), [setState]);
  };

  return {
    JellyfishContextProvider,
    useSelector,
    useConnect,
  };
};
