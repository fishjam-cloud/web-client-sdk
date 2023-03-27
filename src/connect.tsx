import type {
  Peer,
  SerializedMediaEvent,
  TrackContext,
} from "@jellyfish-dev/membrane-webrtc-js";
import { MembraneWebRTC } from "@jellyfish-dev/membrane-webrtc-js";
import type { Channel } from "phoenix";
import { Socket } from "phoenix";
import { DEFAULT_STORE } from "./externalState/externalState";
import type { SetStore, State } from "./state.types";
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
import type { Api } from "./api";
import { createApiWrapper } from "./api";

export type ConnectConfig = {
  disableOnTrackEncodingChanged?: boolean;
};

// todo remove. This is connect function that works with current videoroom implementation
export const connect =
  <PeerMetadata, TrackMetadata>(
    setStore: SetStore<PeerMetadata, TrackMetadata>
  ) =>
  (
    roomId: string,
    peerMetadata: PeerMetadata,
    isSimulcastOn: boolean,
    config?: ConnectConfig
  ): (() => void) => {
    const socket = new Socket("ws://localhost:4000/socket");
    socket.connect();
    const socketOnCloseRef = socket.onClose(() => cleanUp());
    const socketOnErrorRef = socket.onError(() => cleanUp());

    const signaling: Channel = socket.channel(roomId, {
      isSimulcastOn: isSimulcastOn,
    });

    signaling.onError((reason: any) => {
      console.error("WebrtcChannel error occurred");
      console.error(reason);
      // setErrorMessage("WebrtcChannel error occurred");
    });
    signaling.onClose(() => {
      return;
    });

    const includeOnTrackEncodingChanged =
      !config?.disableOnTrackEncodingChanged;

    const webrtc = new MembraneWebRTC({
      callbacks: {
        onSendMediaEvent: (mediaEvent: SerializedMediaEvent) => {
          signaling.push("mediaEvent", { data: mediaEvent });
        },

        onConnectionError: (message) => {
          return;
        },

        // todo [Peer] -> Peer[] ???
        onJoinSuccess: (peerId, peersInRoom: [Peer]) => {
          console.log({ name: "onJoinSuccess", peerId, peersInRoom });
          setStore(onJoinSuccess(peersInRoom, peerId, peerMetadata));
        },

        onRemoved: (reason) => {
          // todo handle reason
          console.log({ name: "onRemoved", reason });
          onPeerRemoved(reason);
        },

        onPeerJoined: (peer) => {
          console.log({ name: "onPeerJoined", peer });
          setStore(onPeerJoined(peer));
        },

        onPeerLeft: (peer) => {
          console.log({ name: "onPeerLeft", peer });
          setStore(onPeerLeft(peer));
        },

        onPeerUpdated: (peer: Peer) => {
          console.log({ name: "onPeerUpdated", peer });
          setStore(onPeerUpdated(peer));
        },

        onTrackReady: (ctx) => {
          console.log({ name: "onTrackReady", ctx });
          setStore(onTrackReady(ctx));
        },

        onTrackAdded: (ctx) => {
          console.log({ name: "onTrackAdded", ctx });
          setStore(onTrackAdded(ctx));
          ctx.onEncodingChanged = () => {
            console.log({ name: "onEncodingChanged", ctx });
            setStore(onEncodingChanged(ctx));
          };
          ctx.onVoiceActivityChanged = () => {
            console.log({ name: "onVoiceActivityChanged", ctx });
            setStore(onVoiceActivityChanged(ctx));
          };
        },

        onTrackRemoved: (ctx) => {
          console.log({ name: "onTrackRemoved", ctx });
          setStore(onTrackRemoved(ctx));
        },

        onTrackUpdated: (ctx: TrackContext) => {
          console.log({ name: "onTrackUpdated", ctx });
          setStore(onTrackUpdated(ctx));
        },

        // todo handle state
        onTracksPriorityChanged: (
          enabledTracks: TrackContext[],
          disabledTracks: TrackContext[]
        ) => {
          console.log({
            name: "onTracksPriorityChanged",
            enabledTracks,
            disabledTracks,
          });
          setStore(onTracksPriorityChanged(enabledTracks, disabledTracks));
        },

        // todo handle state and handle callback
        onJoinError: (metadata) => {
          console.log({ name: "onJoinError", metadata });
          setStore(onJoinError(metadata));
        },

        onBandwidthEstimationChanged: (estimation) => {
          console.log({ name: "onBandwidthEstimationChanged", estimation });
          setStore(onBandwidthEstimationChanged(estimation));
        },

        ...(includeOnTrackEncodingChanged && {
          onTrackEncodingChanged: (peerId, trackId, encoding) => {
            console.log({
              name: "onTrackEncodingChanged",
              peerId,
              trackId,
              encoding,
            });
            setStore(onTrackEncodingChanged(peerId, trackId, encoding));
          },
        }),
      },
    });

    const api: Api<TrackMetadata> = createApiWrapper(webrtc, setStore);

    signaling.on("mediaEvent", (event) => {
      webrtc.receiveMediaEvent(event.data);
    });

    signaling.on("simulcastConfig", () => {
      return;
    });

    setStore(
      (
        prevState: State<PeerMetadata, TrackMetadata>
      ): State<PeerMetadata, TrackMetadata> => {
        return {
          ...prevState,
          status: "connecting",
          connectivity: {
            ...prevState.connectivity,
            socket: socket,
            api: api,
            webrtc: webrtc,
            signaling: signaling,
          },
        };
      }
    );

    signaling
      .join()
      .receive("ok", () => {
        webrtc.join(peerMetadata);
      })
      .receive("error", (response: any) => {
        // setErrorMessage("Connecting error");
        console.error("Received error status");
        console.error(response);
      });

    const cleanUp = () => {
      setStore(() => DEFAULT_STORE);

      webrtc.leave();
      signaling.leave();
      socket.off([socketOnCloseRef, socketOnErrorRef]);
    };

    return () => {
      cleanUp();
    };
  };
