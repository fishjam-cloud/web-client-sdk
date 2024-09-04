import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type {
  BandwidthLimit,
  Component,
  Endpoint,
  MessageEvents,
  Peer,
  SimulcastConfig,
  TrackBandwidthLimit,
  TrackContext,
  Encoding,
} from "@fishjam-cloud/ts-client";
import type { PeerMetadata, TrackMetadata, ConnectConfig } from "../types";
import type { PeerState, Track, TrackId } from "../state.types";
import { useFishjamContext } from "./useFishjamContext";

const eventNames = [
  "socketClose",
  "socketError",
  "socketOpen",
  "authSuccess",
  "authError",
  "disconnected",
  "reconnectionStarted",
  "reconnected",
  "reconnectionRetriesLimitReached",
  "joined",
  "joinError",
  "trackReady",
  "trackAdded",
  "trackRemoved",
  "trackUpdated",
  "peerJoined",
  "peerLeft",
  "peerUpdated",
  "componentAdded",
  "componentRemoved",
  "componentUpdated",
  "connectionError",
  "tracksPriorityChanged",
  "bandwidthEstimationChanged",
  "targetTrackEncodingRequested",
  "localTrackAdded",
  "localTrackRemoved",
  "localTrackReplaced",
  "localTrackMuted",
  "localTrackUnmuted",
  "localTrackBandwidthSet",
  "localTrackEncodingBandwidthSet",
  "localTrackEncodingEnabled",
  "localTrackEncodingDisabled",
  "localPeerMetadataChanged",
  "localTrackMetadataChanged",
  "disconnectRequested",
] as const satisfies (keyof MessageEvents<unknown, unknown>)[];

interface FishjamClientState {
  peers: PeerState[];
  components: PeerState[];
  localPeer: PeerState | null;
  isReconnecting: boolean;
}

function trackContextToTrack(track: TrackContext<PeerMetadata, TrackMetadata>): Track {
  return {
    rawMetadata: track.rawMetadata,
    metadata: track.metadata,
    trackId: track.trackId,
    stream: track.stream,
    simulcastConfig: track.simulcastConfig ?? null,
    encoding: track.encoding ?? null,
    vadStatus: track.vadStatus,
    track: track.track,
    metadataParsingError: track.metadataParsingError,
  };
}

function endpointToPeerState(
  peer:
    | Peer<PeerMetadata, TrackMetadata>
    | Component<PeerMetadata, TrackMetadata>
    | Endpoint<PeerMetadata, TrackMetadata>,
): PeerState {
  const tracks = [...peer.tracks].reduce(
    (acc, [, track]) => ({ ...acc, [track.trackId]: trackContextToTrack(track) }),
    {} as Record<TrackId, Track>,
  );
  return {
    rawMetadata: peer.rawMetadata,
    metadata: peer.metadata,
    metadataParsingError: peer.metadataParsingError,
    id: peer.id,
    tracks,
  };
}

export const useFishjamClient = () => {
  const { fishjamClientRef, peerStatusState } = useFishjamContext();
  const [peerStatus, setPeerStatus] = peerStatusState;

  const client = useMemo(() => fishjamClientRef.current, [fishjamClientRef]);
  const mutationRef = useRef(false);

  const subscribe = useCallback(
    (subscribeCallback: () => void) => {
      const callback = () => {
        mutationRef.current = true;
        subscribeCallback();
      };
      eventNames.forEach((eventName) => client.on(eventName, callback));
      return () => {
        eventNames.forEach((eventName) => client.removeListener(eventName, callback));
      };
    },
    [client],
  );

  const lastSnapshotRef = useRef<FishjamClientState | null>(null);

  const getSnapshot: () => FishjamClientState = useCallback(() => {
    if (mutationRef.current || lastSnapshotRef.current === null) {
      const peers = Object.values(client.getRemotePeers()).map(endpointToPeerState);
      const components = Object.values(client.getRemoteComponents()).map(endpointToPeerState);
      const localEndpoint = client.getLocalPeer();
      const localPeer = localEndpoint ? endpointToPeerState(localEndpoint) : null;
      const isReconnecting = client.isReconnecting();

      lastSnapshotRef.current = {
        peers,
        components,
        localPeer,
        isReconnecting,
      };
      mutationRef.current = false;
    }

    return lastSnapshotRef.current;
  }, [client]);

  const state = useSyncExternalStore(subscribe, getSnapshot);

  function addTrack(
    track: MediaStreamTrack,
    simulcastConfig: SimulcastConfig = { enabled: false, activeEncodings: [], disabledEncodings: [] },
    maxBandwidth: TrackBandwidthLimit = 0, // unlimited bandwidth
  ): Promise<string> {
    return client.addTrack(track, undefined, simulcastConfig, maxBandwidth);
  }

  function connect(config: ConnectConfig) {
    setPeerStatus("connecting");
    return client.connect({ ...config, peerMetadata: config?.peerMetadata ?? {} });
  }

  function disconnect() {
    return client.disconnect();
  }

  function removeTrack(trackId: string) {
    return client.removeTrack(trackId);
  }

  function replaceTrack(trackId: string, track: MediaStreamTrack) {
    return client.replaceTrack(trackId, track);
  }

  function getStatistics(selector?: MediaStreamTrack) {
    return client.getStatistics(selector);
  }

  function getBandwidthEstimation() {
    return client.getBandwidthEstimation();
  }

  function setTrackBandwidth(trackId: string, maxBandwidth: BandwidthLimit) {
    return client.setTrackBandwidth(trackId, maxBandwidth);
  }

  function setEncodingBandwidth(trackId: string, encodingId: string, maxBandwidth: BandwidthLimit) {
    return client.setEncodingBandwidth(trackId, encodingId, maxBandwidth);
  }

  function setTargetTrackEncoding(trackId: string, encoding: Encoding) {
    return client.setTargetTrackEncoding(trackId, encoding);
  }

  function enableTrackEncoding(trackId: string, encoding: Encoding) {
    return client.enableTrackEncoding(trackId, encoding);
  }

  function disableTrackEncoding(trackId: string, encoding: Encoding) {
    return client.disableTrackEncoding(trackId, encoding);
  }

  return {
    ...state,
    peerStatus,
    addTrack,
    connect,
    disconnect,
    removeTrack,
    replaceTrack,
    getStatistics,
    getBandwidthEstimation,
    setTrackBandwidth,
    setEncodingBandwidth,
    setTargetTrackEncoding,
    enableTrackEncoding,
    disableTrackEncoding,
  };
};
