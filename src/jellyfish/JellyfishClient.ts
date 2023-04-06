import { Callbacks, MembraneWebRTC, Peer, SerializedMediaEvent, TrackContext } from "@jellyfish-dev/membrane-webrtc-js";
import TypedEmitter from "typed-emitter";
import { EventEmitter } from "events";

export type MessageEvents = Omit<Required<Callbacks>, "onSendMediaEvent"> & {
  onSocketClose: (event: CloseEvent) => void;
  onSocketError: (event: Event) => void;
  onSocketOpen: (event: Event) => void;
  onAuthRequest: () => void;
  onAuthSuccess: () => void;
  onAuthError: () => void;
  onDisconnected: () => void;
};

export type ConnectConfig<PeerMetadata> = {
  peerMetadata: PeerMetadata;
  isSimulcastOn: boolean;
  websocketUrl?: string;
  disableDeprecated?: boolean;
  token: string;
};

export class JellyfishClient<
  PeerMetadata,
  TrackMetadata
> extends (EventEmitter as new () => TypedEmitter<MessageEvents>) {
  private websocket: WebSocket | null = null;
  // todo hide this object, add additional
  webrtc: MembraneWebRTC | null = null;

  constructor() {
    super();
  }

  connect(config: ConnectConfig<PeerMetadata>): void {
    const { peerMetadata, isSimulcastOn, websocketUrl = "ws://localhost:4000/socket/websocket" } = config;

    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      console.warn("Closing existing websocket connection");
      this.cleanUp();
    }

    this.websocket = new WebSocket(`${websocketUrl}`);

    this.websocket.addEventListener("open", (event) => {
      this.emit("onSocketOpen", event);
    });
    this.websocket.addEventListener("error", (event) => {
      this.emit("onSocketError", event);
    });
    this.websocket.addEventListener("close", (event) => {
      const reason = event.reason;
      console.log("socket closed with reason", reason);
      this.emit("onSocketClose", event);
    });

    this.websocket.addEventListener("open", (event) => {
      this.websocket?.send(
        JSON.stringify({
          type: "controlMessage",
          data: {
            type: "authRequest",
            token: config?.token,
          },
        })
      );

      this.emit("onAuthRequest");
    });

    // TODO: add support for simulcast
    // client
    // this.socket = new Socket(websocketUrl);
    // this.socket.connect();
    // this.socketOnCloseRef = this.socket.onClose(() => this.cleanUp());
    // this.socketOnErrorRef = this.socket.onError(() => this.cleanUp());

    // TODO handle simulcast
    // this.signaling = this.socket.channel(roomId, {
    //   isSimulcastOn: isSimulcastOn,
    // });

    this.webrtc = new MembraneWebRTC();

    this.setupCallbacks();
    // TODO remove after discussion
    // this.setupCallbacks2();

    this.websocket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);

      if (data["type"] == "controlMessage") {
        console.log("controlMessage", data["data"]);
        if (data["data"]["type"] == "authenticated") {
          // Change state to connected
          this.emit("onAuthSuccess");
        } else if (data["data"]["type"] == "unauthenticated") {
          // Change state to connected
          this.emit("onAuthError");
        }
      } else {
        this.webrtc?.receiveMediaEvent(data["data"]);
      }
    });

    // this.signaling.on("simulcastConfig", () => {
    //   return;
    // });

    this.websocket.addEventListener("open", (event) => {
      this.webrtc?.join(peerMetadata);
    });
  }

  private setupCallbacks() {
    this.webrtc?.on("onSendMediaEvent", (mediaEvent: SerializedMediaEvent) => {
      const messageJS = {
        type: "mediaEvent",
        data: mediaEvent,
      };

      const message = JSON.stringify(messageJS);
      this.websocket?.send(message);
    });

    this.webrtc?.on("onConnectionError", (message) => this.emit("onConnectionError", message));
    this.webrtc?.on("onJoinSuccess", (peerId, peersInRoom: [Peer]) => {
      this.emit("onJoinSuccess", peerId, peersInRoom);
    });
    this.webrtc?.on("onRemoved", (reason) => {
      this.emit("onRemoved", reason);
    });
    this.webrtc?.on("onPeerJoined", (peer) => {
      this.emit("onPeerJoined", peer);
    });
    this.webrtc?.on("onPeerLeft", (peer) => {
      this.emit("onPeerLeft", peer);
    });
    this.webrtc?.on("onPeerUpdated", (peer: Peer) => {
      this.emit("onPeerUpdated", peer);
    });
    this.webrtc?.on("onTrackReady", (ctx: TrackContext) => {
      this.emit("onTrackReady", ctx);
    });
    this.webrtc?.on("onTrackAdded", (ctx) => {
      this.emit("onTrackAdded", ctx);
    });
    this.webrtc?.on("onTrackRemoved", (ctx) => {
      this.emit("onTrackRemoved", ctx);
    });
    this.webrtc?.on("onTrackUpdated", (ctx: TrackContext) => {
      this.emit("onTrackUpdated", ctx);
    });
    this.webrtc?.on("onTracksPriorityChanged", (enabledTracks: TrackContext[], disabledTracks: TrackContext[]) => {
      this.emit("onTracksPriorityChanged", enabledTracks, disabledTracks);
    });
    this.webrtc?.on("onJoinError", (metadata) => {
      this.emit("onJoinError", metadata);
    });
    this.webrtc?.on("onBandwidthEstimationChanged", (estimation) => {
      this.emit("onBandwidthEstimationChanged", estimation);
    });
  }

  private setupCallbacks2(config?: ConnectConfig<PeerMetadata>) {
    const callbacks: Omit<Required<Callbacks>, "onSendMediaEvent"> = this.createCallbacks(config);
    let keyCallback: keyof typeof callbacks;
    for (keyCallback in callbacks) {
      const callback = callbacks[keyCallback];
      this.webrtc?.on(keyCallback, callback);
    }
  }

  private createCallbacks(config?: ConnectConfig<PeerMetadata>): Omit<Required<Callbacks>, "onSendMediaEvent"> {
    const includeOnTrackEncodingChanged = !config?.disableDeprecated;

    return {
      onConnectionError: (message) => {
        this.emit("onConnectionError", message);
      },
      // todo [Peer] -> Peer[] ???
      onJoinSuccess: (peerId, peersInRoom: [Peer]) => {
        this.emit("onJoinSuccess", peerId, peersInRoom);
      },
      onRemoved: (reason) => {
        this.emit("onRemoved", reason);
      },
      onPeerJoined: (peer) => {
        this.emit("onPeerJoined", peer);
      },
      onPeerLeft: (peer) => {
        this.emit("onPeerLeft", peer);
      },
      onPeerUpdated: (peer: Peer) => {
        this.emit("onPeerUpdated", peer);
      },
      onTrackReady: (ctx) => {
        this.emit("onTrackReady", ctx);
      },
      onTrackAdded: (ctx) => {
        this.emit("onTrackAdded", ctx);
      },
      onTrackRemoved: (ctx) => {
        this.emit("onTrackRemoved", ctx);
      },
      onTrackUpdated: (ctx: TrackContext) => {
        this.emit("onTrackUpdated", ctx);
      },
      onTracksPriorityChanged: (enabledTracks: TrackContext[], disabledTracks: TrackContext[]) => {
        this.emit("onTracksPriorityChanged", enabledTracks, disabledTracks);
      },
      onJoinError: (metadata) => {
        this.emit("onJoinError", metadata);
      },
      onBandwidthEstimationChanged: (estimation) => {
        this.emit("onBandwidthEstimationChanged", estimation);
      },

      // ...(includeOnTrackEncodingChanged && {
      onTrackEncodingChanged: (peerId, trackId, encoding) => {
        this.emit("onTrackEncodingChanged", peerId, trackId, encoding);
      },
      // }),
    };
  }

  cleanUp() {
    this.webrtc?.leave();
    this.websocket?.close();
    this.websocket = null;
    this.emit("onDisconnected");
  }
}
