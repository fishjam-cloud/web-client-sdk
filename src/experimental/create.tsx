import type { ExternalState } from "./externalState";
import { createStore } from "./externalState";
import { useSelector } from "./useSelector";
import type { Selector } from "../state.types";
import { useMemo } from "react";
import { ConnectConfig } from "@jellyfish-dev/ts-client-sdk";

export type CreateJellyfishClient<PeerMetadata, TrackMetadata> = {
  useConnect: () => (config: ConnectConfig<PeerMetadata>) => () => void;
  useDisconnect: () => () => void;
  useSelector: <Result>(selector: Selector<PeerMetadata, TrackMetadata, Result>) => Result;
};

/**
 * Create a client that can be used without a context.
 *
 * @returns client
 *
 */
export const create = <PeerMetadata, TrackMetadata>(): CreateJellyfishClient<PeerMetadata, TrackMetadata> => {
  const store: ExternalState<PeerMetadata, TrackMetadata> = createStore<PeerMetadata, TrackMetadata>();

  return {
    useConnect: () => {
      // todo remove use memo?
      return useMemo(() => {
        const { dispatch } = store;
        return (config: ConnectConfig<PeerMetadata>): (() => void) => {
          dispatch({ type: "connect", config, dispatch });
          return () => {
            dispatch({ type: "disconnect" });
          };
        };
      }, []);
    },
    useSelector: <Result,>(selector: Selector<PeerMetadata, TrackMetadata, Result>): Result => {
      return useSelector(store, selector);
    },
    useDisconnect: () => {
      return () => {
        store.dispatch({ type: "disconnect" });
      };
    },
  };
};
