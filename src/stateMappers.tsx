import type {
  Peer as JellyfishClientPeer,
  SimulcastConfig,
  TrackContext,
  Endpoint,
} from "@jellyfish-dev/ts-client-sdk";
import type { Peer, PeerId, State, Track, TrackId, TrackWithOrigin } from "./state.types";

export const onSocketOpen =
  <PeerMetadata, TrackMetadata>() =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    return { ...prevState, status: "connected" };
  };

export const onSocketError =
  <PeerMetadata, TrackMetadata>() =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    return { ...prevState, status: "error" };
  };
export const onAuthSuccess =
  <PeerMetadata, TrackMetadata>() =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    return { ...prevState, status: "authenticated" };
  };

export const onAuthError =
  <PeerMetadata, TrackMetadata>() =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    return { ...prevState, status: "error" };
  };

export const onDisconnected =
  <PeerMetadata, TrackMetadata>() =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    return { ...prevState, status: null };
  };

export const onPeerJoined =
  <PeerMetadata, TrackMetadata>(peer: JellyfishClientPeer) =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    const remote: Record<PeerId, Peer<PeerMetadata, TrackMetadata>> = {
      ...prevState.remote,
      [peer.id]: { id: peer.id, metadata: peer.metadata, tracks: {} },
    };

    return { ...prevState, remote };
  };

export const onPeerUpdated =
  <PeerMetadata, TrackMetadata>(peer: JellyfishClientPeer) =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    return {
      ...prevState,
      remote: {
        ...prevState.remote,
        [peer.id]: {
          ...prevState.remote[peer.id],
          id: peer.id,
          metadata: peer.metadata,
        },
      },
    };
  };

export const onPeerLeft =
  <PeerMetadata, TrackMetadata>(peer: JellyfishClientPeer) =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    const remote: Record<PeerId, Peer<PeerMetadata, TrackMetadata>> = {
      ...prevState.remote,
    };

    delete remote[peer.id];

    return { ...prevState, remote };
  };

export const onPeerRemoved =
  <PeerMetadata, TrackMetadata>(_reason: string) =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    return { ...prevState, local: null };
  };

const createTrack = <TrackMetadata,>(ctx: TrackContext): Track<TrackMetadata> => ({
  trackId: ctx.trackId,
  metadata: ctx.metadata,
  stream: ctx.stream,
  vadStatus: ctx.vadStatus,
  track: ctx.track,
  encoding: ctx.encoding || null,
  simulcastConfig: ctx.simulcastConfig
    ? {
        enabled: ctx.simulcastConfig.enabled,
        activeEncodings: [...ctx.simulcastConfig.activeEncodings],
      }
    : null,
});

const createOrigin = (ctx: TrackContext) => ({
  id: ctx.endpoint.id,
  type: ctx.endpoint.type,
  metadata: ctx.endpoint.metadata,
});

export const onTrackReady =
  <PeerMetadata, TrackMetadata>(ctx: TrackContext) =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    if (!ctx.stream) return prevState;
    if (!ctx.endpoint) return prevState;
    if (!ctx.trackId) return prevState;

    const peer = prevState.remote[ctx.endpoint.id];
    const track = createTrack<TrackMetadata>(ctx);
    const trackWithOrigin: TrackWithOrigin<TrackMetadata> = { ...track, origin: createOrigin(ctx) };

    const remote =
      ctx.endpoint.type === "webrtc"
        ? {
            ...prevState.remote,
            [ctx.endpoint.id]: {
              ...peer,
              tracks: {
                ...peer.tracks,
                [ctx.trackId]: track,
              },
            },
          }
        : prevState.remote;

    return {
      ...prevState,
      tracks: { ...prevState.tracks, [ctx.trackId]: trackWithOrigin },
      remote,
    };
  };

export const onTrackAdded =
  <PeerMetadata, TrackMetadata>(ctx: TrackContext) =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    if (!ctx.endpoint) return prevState;
    if (!ctx.trackId) return prevState;

    const peer = prevState.remote[ctx.endpoint.id];
    const track = createTrack<TrackMetadata>(ctx);
    const trackWithOrigin: TrackWithOrigin<TrackMetadata> = { ...track, origin: createOrigin(ctx) };

    const remote =
      ctx.endpoint.type === "webrtc"
        ? {
            ...prevState.remote,
            [ctx.endpoint.id]: {
              ...peer,
              tracks: {
                ...peer.tracks,
                [ctx.trackId]: track,
              },
            },
          }
        : prevState.remote;

    return {
      ...prevState,
      tracks: { ...prevState.tracks, [ctx.trackId]: trackWithOrigin },
      remote,
    };
  };

export const onTrackRemoved = <PeerMetadata, TrackMetadata>(
  prevState: State<PeerMetadata, TrackMetadata>,
  ctx: TrackContext
): State<PeerMetadata, TrackMetadata> => {
  if (!ctx.endpoint) return prevState;
  if (!ctx.trackId) return prevState;

  const remote: Record<PeerId, Peer<PeerMetadata, TrackMetadata>> = {
    ...prevState.remote,
  };
  const tracks: Record<TrackId, TrackWithOrigin<TrackMetadata>> = { ...prevState.tracks };
  delete tracks[ctx.trackId];

  if (ctx.endpoint.type === "webrtc") {
    delete remote[ctx.endpoint.id].tracks[ctx.trackId];
  }

  return { ...prevState, remote, tracks };
};

export const onTrackEncodingChanged = <PeerMetadata, TrackMetadata>(
  prevState: State<PeerMetadata, TrackMetadata>,
  peerId: PeerId,
  trackId: TrackId,
  encoding: "l" | "m" | "h"
): State<PeerMetadata, TrackMetadata> => {
  const peer = prevState.remote[peerId];
  const peerTrack = { ...peer.tracks[trackId], encoding };
  const trackWithOrigin: TrackWithOrigin<TrackMetadata> = { ...prevState.tracks[trackId], encoding };

  return {
    ...prevState,
    tracks: { ...prevState.tracks, [trackId]: trackWithOrigin },
    remote:
      trackWithOrigin.origin.type === "webrtc"
        ? {
            ...prevState.remote,
            [peerId]: {
              ...peer,
              tracks: {
                ...peer.tracks,
                [trackId]: peerTrack,
              },
            },
          }
        : prevState.remote,
  };
};

export const onTrackUpdated = <PeerMetadata, TrackMetadata>(
  prevState: State<PeerMetadata, TrackMetadata>,
  ctx: TrackContext
): State<PeerMetadata, TrackMetadata> => {
  const remote: Record<PeerId, Peer<PeerMetadata, TrackMetadata>> = {
    ...prevState.remote,
  };

  const peer = remote[ctx.endpoint.id];

  const track: Track<TrackMetadata> = {
    ...peer.tracks[ctx.trackId],
    stream: ctx.stream,
    metadata: ctx.metadata,
  };
  const trackWithOrigin: TrackWithOrigin<TrackMetadata> = { ...track, origin: createOrigin(ctx) };

  return {
    ...prevState,
    tracks: { ...prevState.tracks, [ctx.trackId]: trackWithOrigin },
    remote:
      ctx.endpoint.type === "webrtc"
        ? {
            ...prevState.remote,
            [ctx.endpoint.id]: { ...peer, tracks: { ...peer.tracks, [ctx.trackId]: track } },
          }
        : prevState.remote,
  };
};

// todo handle state
export const onTracksPriorityChanged =
  <PeerMetadata, TrackMetadata>(_enabledTracks: TrackContext[], _disabledTracks: TrackContext[]) =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    return prevState;
  };

const toEndpointsMap = (endpoints: Endpoint[]) =>
  new Map(
    endpoints.map((endpoint) => [
      endpoint.id,
      {
        id: endpoint.id,
        type: endpoint.type,
        metadata: endpoint.metadata,
        tracks: {},
      },
    ])
  );

export const onJoinSuccess =
  <PeerMetadata, TrackMetadata>(peersInRoom: JellyfishClientPeer[], peerId: PeerId, peerMetadata: PeerMetadata) =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    const peersMap = toEndpointsMap(peersInRoom.filter((e) => e.type === "webrtc"));

    const remote: Record<PeerId, Peer<PeerMetadata, TrackMetadata>> = Object.fromEntries(peersMap);

    const local: Peer<PeerMetadata, TrackMetadata> = {
      id: peerId,
      metadata: peerMetadata,
      tracks: {},
    };

    return { ...prevState, local, remote, status: "joined" };
  };

// todo handle state and handle callback
export const onJoinError =
  <PeerMetadata, TrackMetadata>(_metadata: unknown) =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    return { ...prevState, status: "error" };
  };

export const addTrack =
  <PeerMetadata, TrackMetadata>(
    remoteTrackId: TrackId,
    track: MediaStreamTrack,
    stream: MediaStream,
    trackMetadata: TrackMetadata | undefined,
    simulcastConfig: SimulcastConfig | undefined
  ) =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    const prevLocalPeer = prevState.local;
    if (!prevLocalPeer) return prevState;

    return {
      ...prevState,
      local: {
        ...prevLocalPeer,
        tracks: {
          ...prevLocalPeer.tracks,
          [remoteTrackId]: {
            track: track,
            trackId: remoteTrackId,
            stream: stream,
            encoding: null,
            metadata: trackMetadata || null,
            vadStatus: "silence", // todo investigate vad status for localPeer
            simulcastConfig: simulcastConfig
              ? {
                  enabled: simulcastConfig?.enabled,
                  activeEncodings: [...simulcastConfig.activeEncodings],
                }
              : null,
          },
        },
      },
    };
  };

export const replaceTrack =
  <PeerMetadata, TrackMetadata>(
    trackId: TrackId,
    newTrack: MediaStreamTrack,
    stream: MediaStream,
    newTrackMetadata: TrackMetadata | undefined
  ) =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    const prevTrack: Track<TrackMetadata> | null = prevState?.local?.tracks[trackId] || null;
    if (!prevTrack) return prevState;
    const prevLocalPeer = prevState.local;
    if (!prevLocalPeer) return prevState;

    const prevMetadata = prevLocalPeer.tracks[trackId].metadata;

    return {
      ...prevState,
      local: {
        ...prevLocalPeer,
        tracks: {
          ...prevLocalPeer.tracks,
          [trackId]: {
            ...prevTrack,
            track: newTrack,
            stream: stream,
            trackId: trackId,
            metadata: newTrackMetadata ? { ...newTrackMetadata } : prevMetadata,
          },
        },
      },
    };
  };

export const removeTrack =
  <PeerMetadata, TrackMetadata>(trackId: TrackId) =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    const prevLocalPeer = prevState.local;
    if (!prevLocalPeer) return prevState;

    const tracksCopy: Record<TrackId, Track<TrackMetadata>> | undefined = prevLocalPeer.tracks;
    delete tracksCopy[trackId];

    return {
      ...prevState,
      local: {
        ...prevLocalPeer,
        tracks: tracksCopy,
      },
    };
  };

export const updateTrackMetadata =
  <PeerMetadata, TrackMetadata>(trackId: TrackId, trackMetadata: TrackMetadata) =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    const prevLocalPeer = prevState.local;
    if (!prevLocalPeer) return prevState;

    const prevTrack: Track<TrackMetadata> | null = prevLocalPeer.tracks[trackId] || null;
    if (!prevTrack) return prevState;

    return {
      ...prevState,
      local: {
        ...prevLocalPeer,
        tracks: {
          ...prevLocalPeer.tracks,
          [trackId]: {
            ...prevTrack,
            metadata: trackMetadata ? { ...trackMetadata } : null,
          },
        },
      },
    };
  };

export const onBandwidthEstimationChanged =
  <PeerMetadata, TrackMetadata>(estimation: bigint) =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    return {
      ...prevState,
      bandwidthEstimation: estimation,
    };
  };

export const onEncodingChanged = <PeerMetadata, TrackMetadata>(
  prevState: State<PeerMetadata, TrackMetadata>,
  ctx: TrackContext
): State<PeerMetadata, TrackMetadata> => {
  if (!ctx.encoding) return prevState;
  return onTrackEncodingChanged<PeerMetadata, TrackMetadata>(prevState, ctx.endpoint.id, ctx.trackId, ctx.encoding);
};

export const onVoiceActivityChanged =
  <PeerMetadata, TrackMetadata>(ctx: TrackContext) =>
  (prevState: State<PeerMetadata, TrackMetadata>): State<PeerMetadata, TrackMetadata> => {
    const peer: Peer<PeerMetadata, TrackMetadata> = prevState.remote[ctx.endpoint.id];
    const tracks: Record<TrackId, Track<TrackMetadata>> = peer.tracks;
    const track: Track<TrackMetadata> = { ...tracks[ctx.trackId], vadStatus: ctx.vadStatus };
    const trackWithOrigin = { ...prevState.tracks[ctx.trackId], vadStatus: ctx.vadStatus };

    return {
      ...prevState,
      tracks: { ...prevState.tracks, [ctx.trackId]: trackWithOrigin },
      remote:
        ctx.endpoint.type === "webrtc"
          ? {
              ...prevState.remote,
              [ctx.endpoint.id]: { ...peer, tracks: { ...tracks, [ctx.trackId]: track } },
            }
          : prevState.remote,
    };
  };
