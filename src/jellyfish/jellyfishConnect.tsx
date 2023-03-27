import type { SetStore } from "../state.types";

import { ConnectConfig, JellyfishClient } from "./JellyfishClient";
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
} from "../stateMappers";
import { addLogging } from "./addLogging";
import { DEFAULT_STORE } from "../externalState/externalState";
import { State } from "../state.types";
import { createApiWrapper } from "../api";

export function connect<PeerMetadata, TrackMetadata>(
  setStore: SetStore<PeerMetadata, TrackMetadata>
) {
  return (
    roomId: string,
    peerId: string,
    peerMetadata: PeerMetadata,
    isSimulcastOn: boolean,
    config?: ConnectConfig
  ): (() => void) => {
    const client = new JellyfishClient<PeerMetadata, TrackMetadata>();

    addLogging<PeerMetadata, TrackMetadata>(client);

    client.messageEmitter.on("onJoinSuccess", (peerId, peersInRoom) => {
      console.log("Join success!");
      setStore(onJoinSuccess(peersInRoom, peerId, peerMetadata));
    });
    // todo handle state and handle callback
    client.messageEmitter.on("onJoinError", (metadata) => {
      setStore(onJoinError(metadata));
    });
    client.messageEmitter.on("onRemoved", (reason) => {
      setStore(onPeerRemoved(reason));
    });
    client.messageEmitter.on("onPeerJoined", (peer) =>
      setStore(onPeerJoined(peer))
    );
    client.messageEmitter.on("onPeerUpdated", (peer) => {
      setStore(onPeerUpdated(peer));
    });
    client.messageEmitter.on("onPeerLeft", (peer) => {
      setStore(onPeerLeft(peer));
    });
    client.messageEmitter.on("onTrackReady", (ctx) => {
      setStore(onTrackReady(ctx));
    });
    client.messageEmitter.on("onTrackAdded", (ctx) => {
      setStore(onTrackAdded(ctx));

      // temporary solution. Add events emitters to TrackContext
      const prevOnEncodingChanged = ctx.onEncodingChanged;
      const prevOnVoiceActivityChanged = ctx.onVoiceActivityChanged;

      ctx.onEncodingChanged = () => {
        prevOnEncodingChanged?.call(ctx);

        setStore(onEncodingChanged(ctx));
      };

      ctx.onVoiceActivityChanged = () => {
        prevOnVoiceActivityChanged?.call(ctx);

        setStore(onVoiceActivityChanged(ctx));
      };
    });
    client.messageEmitter.on("onTrackRemoved", (ctx) => {
      setStore(onTrackRemoved(ctx));
    });
    client.messageEmitter.on("onTrackUpdated", (ctx) => {
      setStore(onTrackUpdated(ctx));
    });
    client.messageEmitter.on("onBandwidthEstimationChanged", (estimation) => {
      setStore(onBandwidthEstimationChanged(estimation));
    });
    client.messageEmitter.on(
      "onTrackEncodingChanged",
      (peerId, trackId, encoding) => {
        setStore(onTrackEncodingChanged(peerId, trackId, encoding));
      }
    );
    // todo handle state
    client.messageEmitter.on(
      "onTracksPriorityChanged",
      (enabledTracks, disabledTracks) => {
        setStore(onTracksPriorityChanged(enabledTracks, disabledTracks));
      }
    );

    client.connect(roomId, peerId, peerMetadata, isSimulcastOn, config);

    setStore(
      (
        prevState: State<PeerMetadata, TrackMetadata>
      ): State<PeerMetadata, TrackMetadata> => {
        return {
          ...prevState,
          status: "connecting",
          connectivity: {
            ...prevState.connectivity,
            socket: client.socket,
            api: client.webrtc
              ? createApiWrapper(client.webrtc, setStore)
              : null,
            webrtc: client.webrtc,
            websocket: client.websocket,
            signaling: client.signaling,
          },
        };
      }
    );
    return () => {
      setStore(() => DEFAULT_STORE);
      client.cleanUp();
    };
  };
}
