import type TypedEmitter from 'typed-emitter';
import type {
  Endpoint,
  SimulcastConfig,
  TrackBandwidthLimit,
  VadStatus,
  EncodingReason,
  Encoding,
  WebRTCEndpointEvents,
} from './webrtc';
import { AuthErrorReason } from './auth';
import { ReconnectConfig } from './reconnection';

export type PeerServerMetadata<PeerMetadata> = {
  peer: PeerMetadata;
  server?: Record<string, unknown>;
};

type TrackContextEvents<Metadata> = {
  encodingChanged: (context: FishjamTrackContext<Metadata>) => void;
  voiceActivityChanged: (context: FishjamTrackContext<Metadata>) => void;
};

export interface FishjamTrackContext<Metadata> extends TypedEmitter<TrackContextEvents<Metadata>> {
  readonly track: MediaStreamTrack | null;
  readonly stream: MediaStream | null;
  readonly endpoint: Endpoint;
  readonly trackId: string;
  readonly simulcastConfig?: SimulcastConfig;
  readonly metadata?: Metadata;
  readonly maxBandwidth?: TrackBandwidthLimit;
  readonly vadStatus: VadStatus;
  readonly encoding?: Encoding;
  readonly encodingReason?: EncodingReason;
}

export type Peer<PeerMetadata, TrackMetadata> = {
  id: string;
  type: string;
  metadata?: PeerServerMetadata<PeerMetadata>;
  tracks: Map<string, FishjamTrackContext<TrackMetadata>>;
};

export type Component = Omit<Endpoint, 'type'> & {
  type: 'recording' | 'hls' | 'file' | 'rtsp' | 'sip';
};

/**
 * Events emitted by the client with their arguments.
 */
export type MessageEvents<PeerMetadata, TrackMetadata> = {
  /**
   * Emitted when connect method invoked
   *
   */
  connectionStarted: () => void;

  /**
   * Emitted when the websocket connection is closed
   *
   * @param {CloseEvent} event - Close event object from the websocket
   */
  socketClose: (event: CloseEvent) => void;

  /**
   * Emitted when occurs an error in the websocket connection
   *
   * @param {Event} event - Event object from the websocket
   */
  socketError: (event: Event) => void;

  /**
   * Emitted when the websocket connection is opened
   *
   * @param {Event} event - Event object from the websocket
   */
  socketOpen: (event: Event) => void;

  /** Emitted when authentication is successful */
  authSuccess: () => void;

  /** Emitted when authentication fails */
  authError: (reason: AuthErrorReason) => void;

  /** Emitted when the connection is closed */
  disconnected: () => void;

  /** Emitted when the process of reconnection starts */
  reconnectionStarted: () => void;

  /** Emitted on successful reconnection */
  reconnected: () => void;

  /** Emitted when the maximum number of reconnection retries is reached */
  reconnectionRetriesLimitReached: () => void;

  /**
   * Called when peer was accepted.
   */
  joined: (peerId: string, peers: Peer<PeerMetadata, TrackMetadata>[], components: Component[]) => void;

  /**
   * Called when peer was not accepted
   * @param metadata - Pass through for client application to communicate further actions to frontend
   */
  joinError: (metadata: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

  /**
   * Called when data in a new track arrives.
   *
   * This callback is always called after {@link MessageEvents.trackAdded}.
   * It informs user that data related to the given track arrives and can be played or displayed.
   */
  trackReady: (ctx: FishjamTrackContext<TrackMetadata>) => void;

  /**
   * Called each time the peer which was already in the room, adds new track. Fields track and stream will be set to null.
   * These fields will be set to non-null value in {@link MessageEvents.trackReady}
   */
  trackAdded: (ctx: FishjamTrackContext<TrackMetadata>) => void;

  /**
   * Called when some track will no longer be sent.
   *
   * It will also be called before {@link MessageEvents.peerLeft} for each track of this peer.
   */
  trackRemoved: (ctx: FishjamTrackContext<TrackMetadata>) => void;

  /**
   * Called each time peer has its track metadata updated.
   */
  trackUpdated: (ctx: FishjamTrackContext<TrackMetadata>) => void;

  /**
   * Called each time new peer joins the room.
   */
  peerJoined: (peer: Peer<PeerMetadata, TrackMetadata>) => void;

  /**
   * Called each time peer leaves the room.
   */
  peerLeft: (peer: Peer<PeerMetadata, TrackMetadata>) => void;

  /**
   * Called each time peer has its metadata updated.
   */
  peerUpdated: (peer: Peer<PeerMetadata, TrackMetadata>) => void;

  /**
   * Called each time new peer joins the room.
   */
  componentAdded: (peer: Component) => void;

  /**
   * Called each time peer leaves the room.
   */
  componentRemoved: (peer: Component) => void;

  /**
   * Called each time peer has its metadata updated.
   */
  componentUpdated: (peer: Component) => void;

  /**
   * Called in case of errors related to multimedia session e.g. ICE connection.
   */
  connectionError: (error: { message: string; event?: Event }) => void;

  /**
   * Currently, this callback is only invoked when DisplayManager in RTC Engine is
   * enabled and simulcast is disabled.
   *
   * Called when priority of video tracks have changed.
   * @param enabledTracks - list of tracks which will be sent to client from SFU
   * @param disabledTracks - list of tracks which will not be sent to client from SFU
   */
  tracksPriorityChanged: (
    enabledTracks: FishjamTrackContext<TrackMetadata>[],
    disabledTracks: FishjamTrackContext<TrackMetadata>[],
  ) => void;

  /**
   * Called every time the server estimates client's bandiwdth.
   *
   * @param {bigint} estimation - client's available incoming bitrate estimated
   * by the server. It's measured in bits per second.
   */
  bandwidthEstimationChanged: (estimation: bigint) => void;

  targetTrackEncodingRequested: (event: Parameters<WebRTCEndpointEvents['targetTrackEncodingRequested']>[0]) => void;
  localTrackAdded: (event: Parameters<WebRTCEndpointEvents['localTrackAdded']>[0]) => void;
  localTrackRemoved: (event: Parameters<WebRTCEndpointEvents['localTrackRemoved']>[0]) => void;
  localTrackReplaced: (event: Parameters<WebRTCEndpointEvents['localTrackReplaced']>[0]) => void;
  localTrackMuted: (event: Parameters<WebRTCEndpointEvents['localTrackMuted']>[0]) => void;
  localTrackUnmuted: (event: Parameters<WebRTCEndpointEvents['localTrackUnmuted']>[0]) => void;
  localTrackBandwidthSet: (event: Parameters<WebRTCEndpointEvents['localTrackBandwidthSet']>[0]) => void;
  localTrackEncodingBandwidthSet: (
    event: Parameters<WebRTCEndpointEvents['localTrackEncodingBandwidthSet']>[0],
  ) => void;
  localTrackEncodingEnabled: (event: Parameters<WebRTCEndpointEvents['localTrackEncodingEnabled']>[0]) => void;
  localTrackEncodingDisabled: (event: Parameters<WebRTCEndpointEvents['localTrackEncodingDisabled']>[0]) => void;
  localPeerMetadataChanged: (event: Parameters<WebRTCEndpointEvents['localEndpointMetadataChanged']>[0]) => void;
  localTrackMetadataChanged: (event: Parameters<WebRTCEndpointEvents['localTrackMetadataChanged']>[0]) => void;
  disconnectRequested: (event: Parameters<WebRTCEndpointEvents['disconnectRequested']>[0]) => void;
};

/** Configuration object for the client */
export interface ConnectConfig<PeerMetadata> {
  /** Metadata for the peer */
  peerMetadata: PeerMetadata;

  /** Token for authentication */
  token: string;

  /** Fishjam url */
  url: string;
}

export type CreateConfig = {
  reconnect?: ReconnectConfig | boolean;
};