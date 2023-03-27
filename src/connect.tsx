import type { SetStore } from "./state.types";

import { ConnectConfig, JellyfishClient } from "./jellyfish/JellyfishClient";
import {
  onBandwidthEstimationChanged,
  onEncodingChanged,
  onJoinError,
  onJoinSuccess,
  onPeerJoined,
  onPeerLeft,
  onPeerRemoved,
  onPeerUpdated,
  onTrackAdded,
  onTrackEncodingChanged,
  onTrackReady,
  onTrackRemoved,
  onTracksPriorityChanged,
  onTrackUpdated,
  onVoiceActivityChanged,
} from "./stateMappers";
import { addLogging } from "./jellyfish/addLogging";
import { DEFAULT_STORE } from "./externalState/externalState";
import { State } from "./state.types";
import { createApiWrapper } from "./api";

export function connect<PeerMetadata, TrackMetadata>(setStore: SetStore<PeerMetadata, TrackMetadata>) {
  return (
    roomId: string,
    peerId: string,
    peerMetadata: PeerMetadata,
    isSimulcastOn: boolean,
    config?: ConnectConfig
  ): (() => void) => {
    const client = new JellyfishClient<PeerMetadata, TrackMetadata>();

    addLogging<PeerMetadata, TrackMetadata>(client);

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

    client.connect(roomId, peerId, peerMetadata, isSimulcastOn, config);

    setStore((prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
      return {
        ...prevState,
        status: "connecting",
        connectivity: {
          ...prevState.connectivity,
          api: client.webrtc ? createApiWrapper(client.webrtc, setStore) : null,
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
