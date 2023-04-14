import type { SetStore } from "./state.types";

import {
  onAuthError,
  onAuthSuccess,
  onBandwidthEstimationChanged,
  onDisconnected,
  onEncodingChanged,
  onJoinError,
  onJoinSuccess,
  onPeerJoined,
  onPeerLeft,
  onPeerRemoved,
  onPeerUpdated,
  onSocketError,
  onSocketOpen,
  onTrackAdded,
  onTrackEncodingChanged,
  onTrackReady,
  onTrackRemoved,
  onTracksPriorityChanged,
  onTrackUpdated,
  onVoiceActivityChanged,
} from "./stateMappers";
import { State } from "./state.types";
import { createApiWrapper } from "./api";
import { Config, JellyfishClient } from "@jellyfish-dev/ts-client-sdk";
import { DEFAULT_STORE } from "./state";

/**
 * Connects to the Jellyfish server.
 * Also adds listeners to the JellyfishClient to update the store.
 *
 * @param setStore - function that sets the store
 * @returns function that disconnects from the Jellyfish server
 */
export function connect<PeerMetadata, TrackMetadata>(setStore: SetStore<PeerMetadata, TrackMetadata>) {
  return (config: Config<PeerMetadata>): (() => void) => {
    const { peerMetadata } = config;

    const client = new JellyfishClient<PeerMetadata, TrackMetadata>();

    client.on("onSocketOpen", () => {
      setStore(onSocketOpen());
    });

    client.on("onSocketError", () => {
      setStore(onSocketError());
    });

    client.on("onAuthSuccess", () => {
      setStore(onAuthSuccess());
    });

    client.on("onAuthError", () => {
      setStore(onAuthError());
    });

    client.on("onDisconnected", () => {
      setStore(onDisconnected());
    });

    client.on("onJoinSuccess", (peerId, peersInRoom) => {
      setStore(onJoinSuccess(peersInRoom, peerId, peerMetadata));
    });
    // todo handle state and handle callback
    client.on("onJoinError", (metadata) => {
      setStore(onJoinError(metadata));
    });
    client.on("onRemoved", (reason) => {
      setStore(onPeerRemoved(reason));
    });
    client.on("onPeerJoined", (peer) => setStore(onPeerJoined(peer)));
    client.on("onPeerUpdated", (peer) => {
      setStore(onPeerUpdated(peer));
    });
    client.on("onPeerLeft", (peer) => {
      setStore(onPeerLeft(peer));
    });
    client.on("onTrackReady", (ctx) => {
      setStore(onTrackReady(ctx));
    });
    client.on("onTrackAdded", (ctx) => {
      setStore(onTrackAdded(ctx));

      ctx.on("onEncodingChanged", () => {
        setStore(onEncodingChanged(ctx));
      });
      ctx.on("onVoiceActivityChanged", () => {
        setStore(onVoiceActivityChanged(ctx));
      });
    });
    client.on("onTrackRemoved", (ctx) => {
      setStore(onTrackRemoved(ctx));
    });
    client.on("onTrackUpdated", (ctx) => {
      setStore(onTrackUpdated(ctx));
    });
    client.on("onBandwidthEstimationChanged", (estimation) => {
      setStore(onBandwidthEstimationChanged(estimation));
    });
    client.on("onTrackEncodingChanged", (peerId, trackId, encoding) => {
      setStore(onTrackEncodingChanged(peerId, trackId, encoding));
    });
    // todo handle state
    client.on("onTracksPriorityChanged", (enabledTracks, disabledTracks) => {
      setStore(onTracksPriorityChanged(enabledTracks, disabledTracks));
    });

    client.connect(config);

    setStore((prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
      return {
        ...prevState,
        status: "connecting",
        connectivity: {
          ...prevState.connectivity,
          api: client ? createApiWrapper(client, setStore) : null,
          client: client,
        },
      };
    });

    return () => {
      setStore(() => DEFAULT_STORE);
      client.cleanUp();
    };
  };
}
