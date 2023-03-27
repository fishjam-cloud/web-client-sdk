import type { SetStore, State } from "../state.types";

export type ExternalState<PeerMetadata, TrackMetadata> = {
  getSnapshot: () => State<PeerMetadata, TrackMetadata>;
  setStore: SetStore<PeerMetadata, TrackMetadata>;
  subscribe: (onStoreChange: () => void) => () => void;
};

export type Subscribe = (onStoreChange: () => void) => () => void;
export type Listener = () => void;

export const DEFAULT_STORE: State<any, any> = {
  local: null,
  remote: {},
  status: null,
  bandwidthEstimation: BigInt(0), // todo investigate bigint n notation
  connectivity: {
    api: null,
    connect: null,
    client: null,
  },
};

export const createStore = <PeerMetadata, TrackMetadata>(): ExternalState<PeerMetadata, TrackMetadata> => {
  type StateType = State<PeerMetadata, TrackMetadata>;

  let listeners: Listener[] = [];
  let store: State<PeerMetadata, TrackMetadata> = DEFAULT_STORE;

  const getSnapshot = (): StateType => {
    return store;
  };

  const subscribe: (onStoreChange: () => void) => () => void = (callback: Listener) => {
    listeners = [...listeners, callback];

    return () => {
      listeners = listeners.filter((e) => e !== callback);
    };
  };

  const setStore = (setter: (prevState: StateType) => StateType) => {
    store = setter(store);

    listeners.forEach((listener) => {
      listener();
    });
  };

  return { getSnapshot, subscribe, setStore };
};
