import { Dispatch } from "react";
import type { State } from "./state.types";
import {
  addTrack,
  onAuthError,
  onAuthSuccess,
  onBandwidthEstimationChanged,
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
  onTrackReady,
  onTrackRemoved,
  onTracksPriorityChanged,
  onTrackUpdated,
  onVoiceActivityChanged,
  removeTrack,
  replaceTrack,
  updateTrackMetadata,
} from "./stateMappers";
import { createApiWrapper } from "./api";
import {
  Config,
  Endpoint,
  JellyfishClient,
  SimulcastConfig,
  TrackBandwidthLimit,
  TrackContext,
} from "@jellyfish-dev/ts-client-sdk";
import { INITIAL_STATE, UseUserMediaAction, userMediaReducer } from "./useUserMedia";
import { UseCameraAndMicrophoneResult } from "./useMedia/types";
import {
  screenshareReducer,
  UseScreenshareAction,
  INITIAL_STATE as SCREENSHARE_INITIAL_STATE,
} from "./useMedia/screenshare";

export const createDefaultDevices = <TrackMetadata,>(): UseCameraAndMicrophoneResult<TrackMetadata> => ({
  camera: {
    stop: () => {},
    setEnable: (_value: boolean) => {},
    start: () => {},
    addTrack: (
      _trackMetadata?: TrackMetadata,
      _simulcastConfig?: SimulcastConfig,
      _maxBandwidth?: TrackBandwidthLimit
    ) => {},
    removeTrack: () => {},
    replaceTrack: (_newTrack: MediaStreamTrack, _stream: MediaStream, _newTrackMetadata?: TrackMetadata) =>
      Promise.reject(),
    broadcast: null,
    status: null,
    stream: null,
    track: null,
    enabled: false,
    deviceInfo: null,
    error: null,
    devices: null,
  },
  microphone: {
    stop: () => {},
    setEnable: (_value: boolean) => {},
    start: () => {}, // startByType
    addTrack: (_trackMetadata?: TrackMetadata, _maxBandwidth?: TrackBandwidthLimit) => {}, // remote
    removeTrack: () => {}, // remote
    replaceTrack: (_newTrack: MediaStreamTrack, _stream: MediaStream, _newTrackMetadata?: TrackMetadata) =>
      Promise.reject(), // remote
    broadcast: null,
    status: null, // todo how to ull
    stream: null,
    track: null,
    enabled: false,
    deviceInfo: null,
    error: null,
    devices: null,
  },
  screenshare: {
    stop: () => {},
    setEnable: (_value: boolean) => {},
    start: () => {}, // startByType
    addTrack: (_trackMetadata?: TrackMetadata, _maxBandwidth?: TrackBandwidthLimit) => {}, // remote
    removeTrack: () => {}, // remote
    replaceTrack: (_newTrack: MediaStreamTrack, _stream: MediaStream, _newTrackMetadata?: TrackMetadata) =>
      Promise.reject(), // remote
    broadcast: null,
    status: null, // todo how to ull
    stream: null,
    track: null,
    enabled: false,
    error: null,
  },
  start: () => {},
  init: () => {},
});

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
  screenshare: SCREENSHARE_INITIAL_STATE,
});

export type ConnectAction<PeerMetadata, TrackMetadata> = {
  type: "connect";
  config: Config<PeerMetadata>;
  dispatch: Dispatch<Action<PeerMetadata, TrackMetadata>>;
};

export type DisconnectAction = {
  type: "disconnect";
};

export type OnJoinErrorAction = {
  type: "onJoinError";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any;
};

export type OnSocketErrorAction = {
  type: "onSocketError";
};

export type OnAuthErrorAction = {
  type: "onAuthError";
};

export type OnJoinSuccessAction<PeerMetadata> = {
  type: "onJoinSuccess";
  peerMetadata: PeerMetadata;
  peersInRoom: Endpoint[];
  peerId: string;
};

export type OnAuthSuccessAction = {
  type: "onAuthSuccess";
};

export type OnSocketOpenAction = {
  type: "onSocketOpen";
};
export type OnRemovedAction = {
  type: "onRemoved";
  reason: string;
};

export type OnDisconnectedAction = {
  type: "onDisconnected";
};

export type OnTrackAddedAction = {
  type: "onTrackAdded";
  ctx: TrackContext;
};

export type OnTrackReadyAction = {
  type: "onTrackReady";
  ctx: TrackContext;
};

export type OnTrackUpdatedAction = {
  type: "onTrackUpdated";
  ctx: TrackContext;
};

export type OnTrackRemovedAction = {
  type: "onTrackRemoved";
  ctx: TrackContext;
};

export type OnTrackEncodingChange = {
  type: "encodingChanged";
  ctx: TrackContext;
};

export type OnTrackVoiceActivityChanged = {
  type: "voiceActivityChanged";
  ctx: TrackContext;
};

export type OnBandwidthEstimationChangedAction = {
  type: "onBandwidthEstimationChanged";
  estimation: bigint;
};

export type OnTracksPriorityChangedAction = {
  type: "onTracksPriorityChanged";
  enabledTracks: TrackContext[];
  disabledTracks: TrackContext[];
};

export type OnPeerJoinedAction = {
  type: "onPeerJoined";
  peer: Endpoint;
};

export type OnPeerLeftAction = {
  type: "onPeerLeft";
  peer: Endpoint;
};

export type OnPeerUpdatedAction = {
  type: "onPeerUpdated";
  peer: Endpoint;
};

// Local
export type LocalAddTrackAction<TrackMetadata> = {
  type: "localAddTrack";
  remoteTrackId: string;
  track: MediaStreamTrack;
  stream: MediaStream;
  trackMetadata?: TrackMetadata;
  simulcastConfig?: SimulcastConfig;
};

export type LocalReplaceTrackAction<TrackMetadata> = {
  type: "localReplaceTrack";
  trackId: string;
  newTrack: MediaStreamTrack;
  stream: MediaStream;
  newTrackMetadata?: TrackMetadata;
};

export type LocalRemoveTrackAction = {
  type: "localRemoveTrack";
  trackId: string;
};

export type LocalUpdateTrackMetadataAction<TrackMetadata> = {
  type: "localUpdateTrackMetadata";
  trackId: string;
  trackMetadata: TrackMetadata;
};

export type SetDevices<TrackMetadata> = { type: "setDevices"; data: UseCameraAndMicrophoneResult<TrackMetadata> };

export type Action<PeerMetadata, TrackMetadata> =
  | ConnectAction<PeerMetadata, TrackMetadata>
  | DisconnectAction
  | OnJoinSuccessAction<PeerMetadata>
  | OnAuthSuccessAction
  | OnAuthErrorAction
  | OnSocketOpenAction
  | OnSocketErrorAction
  | OnDisconnectedAction
  | OnRemovedAction
  | OnTrackReadyAction
  | OnTrackAddedAction
  | OnTrackUpdatedAction
  | OnTrackRemovedAction
  | OnTrackEncodingChange
  | OnTrackVoiceActivityChanged
  | OnBandwidthEstimationChangedAction
  | OnTracksPriorityChangedAction
  | OnPeerJoinedAction
  | OnPeerUpdatedAction
  | OnPeerLeftAction
  | OnJoinErrorAction
  | LocalReplaceTrackAction<TrackMetadata>
  | LocalRemoveTrackAction
  | LocalUpdateTrackMetadataAction<TrackMetadata>
  | LocalAddTrackAction<TrackMetadata>
  | SetDevices<TrackMetadata>
  | UseUserMediaAction
  | UseScreenshareAction;

const onConnect = <PeerMetadata, TrackMetadata>(
  state: State<PeerMetadata, TrackMetadata>,
  action: ConnectAction<PeerMetadata, TrackMetadata>
): State<PeerMetadata, TrackMetadata> => {
  const client: JellyfishClient<PeerMetadata, TrackMetadata> | null = state?.connectivity.client;

  const { peerMetadata } = action.config;

  if (client === null) {
    throw Error("Client is null");
  }

  const api = state?.connectivity.api ? state?.connectivity.api : createApiWrapper(client, action.dispatch);

  if (client?.status === "initialized") {
    return {
      ...state,
      status: "connecting",
      connectivity: {
        ...state.connectivity,
        api,
        client,
      },
    };
  }

  client.on("socketOpen", () => {
    action.dispatch({ type: "onSocketOpen" });
  });

  client.on("socketError", () => {
    action.dispatch({ type: "onSocketError" });
  });

  client.on("authSuccess", () => {
    action.dispatch({ type: "onAuthSuccess" });
  });

  client.on("authError", () => {
    action.dispatch({ type: "onAuthError" });
  });

  client.on("disconnected", () => {
    action.dispatch({ type: "onDisconnected" });
  });

  client.on("joined", (peerId: string, peersInRoom: Endpoint[]) => {
    action.dispatch({ type: "onJoinSuccess", peersInRoom, peerId, peerMetadata });
  });
  // todo handle state and handle callback
  client.on("joinError", (metadata) => {
    action.dispatch({ type: "onJoinError", metadata });
  });
  client.on("peerJoined", (peer) => {
    action.dispatch({ type: "onPeerJoined", peer });
  });
  client.on("peerUpdated", (peer) => {
    action.dispatch({ type: "onPeerUpdated", peer });
  });
  client.on("peerLeft", (peer) => {
    action.dispatch({ type: "onPeerLeft", peer });
  });
  client.on("trackReady", (ctx) => {
    action.dispatch({ type: "onTrackReady", ctx });
  });
  client.on("trackAdded", (ctx) => {
    action.dispatch({ type: "onTrackAdded", ctx });

    ctx.on("encodingChanged", () => {
      action.dispatch({ type: "encodingChanged", ctx });
    });
    ctx.on("voiceActivityChanged", () => {
      action.dispatch({ type: "voiceActivityChanged", ctx });
    });
  });
  client.on("trackRemoved", (ctx) => {
    action.dispatch({ type: "onTrackRemoved", ctx });
    ctx.removeAllListeners();
  });
  client.on("trackUpdated", (ctx) => {
    action.dispatch({ type: "onTrackUpdated", ctx });
  });
  client.on("bandwidthEstimationChanged", (estimation) => {
    action.dispatch({ type: "onBandwidthEstimationChanged", estimation });
  });
  // todo handle state
  client.on("tracksPriorityChanged", (enabledTracks, disabledTracks) => {
    action.dispatch({ type: "onTracksPriorityChanged", enabledTracks, disabledTracks });
  });

  client.connect(action.config);

  return {
    ...state,
    status: "connecting",
    connectivity: {
      api,
      client,
    },
  };
};

export const reducer = <PeerMetadata, TrackMetadata>(
  state: State<PeerMetadata, TrackMetadata>,
  action: Action<PeerMetadata, TrackMetadata>
): State<PeerMetadata, TrackMetadata> => {
  switch (action.type) {
    // Internal events
    case "connect":
      return onConnect<PeerMetadata, TrackMetadata>(state, action);
    case "disconnect":
      state?.connectivity?.client?.removeAllListeners();
      state?.connectivity?.client?.disconnect();
      return { ...createDefaultState(), media: state.media };
    // connections events
    case "onSocketOpen":
      return onSocketOpen<PeerMetadata, TrackMetadata>()(state);
    case "onSocketError":
      return onSocketError<PeerMetadata, TrackMetadata>()(state);
    case "onJoinSuccess":
      return onJoinSuccess<PeerMetadata, TrackMetadata>(action.peersInRoom, action.peerId, action.peerMetadata)(state);
    case "onJoinError":
      return onJoinError<PeerMetadata, TrackMetadata>(action.metadata)(state);
    case "onDisconnected":
      state?.connectivity?.client?.removeAllListeners();
      state?.connectivity?.client?.disconnect();
      // return onDisconnected<PeerMetadata, TrackMetadata>()(state)
      return { ...createDefaultState(), media: state.media };
    case "onAuthSuccess":
      return onAuthSuccess<PeerMetadata, TrackMetadata>()(state);
    case "onAuthError":
      return onAuthError<PeerMetadata, TrackMetadata>()(state);
    case "onRemoved":
      return onPeerRemoved<PeerMetadata, TrackMetadata>(action.reason)(state);
    // this peer events
    case "onBandwidthEstimationChanged":
      return onBandwidthEstimationChanged<PeerMetadata, TrackMetadata>(action.estimation)(state);
    // remote peers events
    case "onPeerJoined":
      return onPeerJoined<PeerMetadata, TrackMetadata>(action.peer)(state);
    case "onPeerUpdated":
      return onPeerUpdated<PeerMetadata, TrackMetadata>(action.peer)(state);
    case "onPeerLeft":
      return onPeerLeft<PeerMetadata, TrackMetadata>(action.peer)(state);
    // remote track events
    case "onTrackAdded":
      return onTrackAdded<PeerMetadata, TrackMetadata>(action.ctx)(state);
    case "onTrackReady":
      return onTrackReady<PeerMetadata, TrackMetadata>(action.ctx)(state);
    case "onTrackUpdated":
      return onTrackUpdated<PeerMetadata, TrackMetadata>(state, action.ctx);
    case "onTrackRemoved":
      return onTrackRemoved<PeerMetadata, TrackMetadata>(state, action.ctx);
    case "encodingChanged":
      return onEncodingChanged<PeerMetadata, TrackMetadata>(state, action.ctx);
    case "voiceActivityChanged":
      return onVoiceActivityChanged<PeerMetadata, TrackMetadata>(action.ctx)(state);
    // local track events
    case "localAddTrack":
      return addTrack<PeerMetadata, TrackMetadata>(
        action.remoteTrackId,
        action.track,
        action.stream,
        action.trackMetadata,
        action.simulcastConfig
      )(state);
    case "localRemoveTrack":
      return removeTrack<PeerMetadata, TrackMetadata>(action.trackId)(state);
    case "localReplaceTrack":
      return replaceTrack<PeerMetadata, TrackMetadata>(
        action.trackId,
        action.newTrack,
        action.stream,
        action.newTrackMetadata
      )(state);
    case "localUpdateTrackMetadata":
      return updateTrackMetadata<PeerMetadata, TrackMetadata>(action.trackId, action.trackMetadata)(state);
    case "onTracksPriorityChanged":
      return onTracksPriorityChanged<PeerMetadata, TrackMetadata>(action.enabledTracks, action.disabledTracks)(state);
    case "setDevices":
      return { ...state, devices: action.data };
    case "UseUserMedia-loading":
    case "UseUserMedia-setAudioAndVideo":
    case "UseUserMedia-setEnable":
    case "UseUserMedia-setError":
    case "UseUserMedia-setMedia":
    case "UseUserMedia-stopDevice":
      return { ...state, media: userMediaReducer(state.media, action) };
    case "UseScreenshare-loading":
    case "UseScreenshare-setEnable":
    case "UseScreenshare-setError":
    case "UseScreenshare-setScreenshare":
    case "UseScreenshare-stop":
      return { ...state, screenshare: screenshareReducer(state.screenshare, action) };
  }

  throw Error("Unhandled Action");
};

export type Reducer<PeerMetadata, TrackMetadata> = (
  state: State<PeerMetadata, TrackMetadata>,
  action: Action<PeerMetadata, TrackMetadata>
) => State<PeerMetadata, TrackMetadata>;
