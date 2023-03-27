import type { ExternalState } from "./externalState";
import { createStore } from "./externalState";
import { useSelector } from "./useSelector";
import type { Selector } from "../state.types";
import { useMemo } from "react";
import { connect } from "../jellyfish/jellyfishConnect";
import { ConnectConfig } from "../jellyfish/JellyfishClient";

export type CreateNoContextJellyfishClient<PeerMetadata, TrackMetadata> = {
  useConnect: () => <TrackMetadata>(
    roomId: string,
    peerId: string,
    peerMetadata: PeerMetadata,
    isSimulcastOn: boolean,
    config?: ConnectConfig
  ) => () => void;
  useSelector: <Result>(
    selector: Selector<PeerMetadata, TrackMetadata, Result>
  ) => Result;
};

export const createNoContextMembraneClient = <
  PeerMetadata,
  TrackMetadata
>(): CreateNoContextJellyfishClient<PeerMetadata, TrackMetadata> => {
  const store: ExternalState<PeerMetadata, TrackMetadata> = createStore<
    PeerMetadata,
    TrackMetadata
  >();

  return {
    useConnect: () => {
      return useMemo(() => connect(store.setStore), []);
    },
    useSelector: <Result,>(
      selector: Selector<PeerMetadata, TrackMetadata, Result>
    ): Result => {
      return useSelector(store, selector);
    },
  };
};
