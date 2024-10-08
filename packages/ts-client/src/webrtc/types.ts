import type TypedEmitter from 'typed-emitter';
import type { SerializedMediaEvent } from './mediaEvent';

export type MetadataParser<ParsedMetadata> = (rawMetadata: unknown) => ParsedMetadata;
export type LocalTrackId = string;
export type MLineId = string;
export type MediaStreamTrackId = string;
export type RemoteTrackId = string;

export type TrackKind = 'audio' | 'video';

/**
 * Type describing Voice Activity Detection statuses.
 *
 * - `speech` - voice activity has been detected
 * - `silence` - lack of voice activity has been detected
 */
export type VadStatus = 'speech' | 'silence';

/**
 * Type describing maximal bandwidth that can be used, in kbps. 0 is interpreted as unlimited bandwidth.
 */
export type BandwidthLimit = number;

/**
 * Type describing bandwidth limit for simulcast track.
 * It is a mapping (encoding => BandwidthLimit).
 * If encoding isn't present in this mapping, it will be assumed that this particular encoding shouldn't have any bandwidth limit
 */
export type SimulcastBandwidthLimit = Map<Encoding, BandwidthLimit>;

/**
 * Type describing bandwidth limitation of a Track, including simulcast and non-simulcast tracks.
 * A sum type of `BandwidthLimit` and `SimulcastBandwidthLimit`
 */
export type TrackBandwidthLimit = BandwidthLimit | SimulcastBandwidthLimit;

/**
 * Type describing possible reasons for currently selected encoding.
 * - `other` - the exact reason couldn't be determined
 * - `encodingInactive` - previously selected encoding became inactive
 * - `lowBandwidth` - there is no longer enough bandwidth to maintain previously selected encoding
 */
export type EncodingReason = 'other' | 'encodingInactive' | 'lowBandwidth';

/**
 * Simulcast configuration passed to {@link WebRTCEndpoint.addTrack}.
 *
 * At the moment, simulcast track is initialized in three versions - low, medium and high.
 * High resolution is the original track resolution, while medium and low resolutions
 * are the original track resolution scaled down by 2 and 4 respectively.
 */
export interface SimulcastConfig {
  /**
   * Whether to simulcast track or not.
   */
  enabled: boolean;
  /**
   * List of initially active encodings.
   *
   * Encoding that is not present in this list might still be
   * enabled using {@link WebRTCEndpoint.enableTrackEncoding}.
   */
  activeEncodings: Encoding[];

  /**
   * List of disabled encodings.
   *
   * Encoding that is present in this list was
   * disabled using {@link WebRTCEndpoint.disableTrackEncoding}.
   */
  disabledEncodings: Encoding[];
}

/**
 * Track's context i.e. all data that can be useful when operating on track.
 */
interface TrackContextFields<EndpointMetadata, TrackMetadata> {
  readonly track: MediaStreamTrack | null;

  /**
   * Stream this track belongs to.
   */
  readonly stream: MediaStream | null;

  /**
   * Endpoint this track comes from.
   */
  readonly endpoint: Endpoint<EndpointMetadata, TrackMetadata>;

  /**
   * Track id. It is generated by RTC engine and takes form `endpoint_id:<random_uuidv4>`.
   * It is WebRTC agnostic i.e. it does not contain `mid` or `stream id`.
   */

  readonly trackId: string;
  /**
   * Simulcast configuration.
   * Only present for local tracks.
   */
  readonly simulcastConfig?: SimulcastConfig;

  /**
   * Any info that was passed in {@link WebRTCEndpoint.addTrack}.
   */
  readonly metadata?: TrackMetadata;
  readonly rawMetadata: any;
  readonly metadataParsingError?: any;

  readonly maxBandwidth?: TrackBandwidthLimit;

  readonly vadStatus: VadStatus;

  /**
   * Encoding that is currently received.
   * Only present for remote tracks.
   */
  readonly encoding?: Encoding;

  /**
   * The reason of currently selected encoding.
   * Only present for remote tracks.
   */
  readonly encodingReason?: EncodingReason;
}

export interface TrackContextEvents<EndpointMetadata, TrackMetadata> {
  /**
   * Emitted each time track encoding has changed.
   *
   * Track encoding can change in the following cases:
   * - when user requested a change
   * - when sender stopped sending some encoding (because of bandwidth change)
   * - when receiver doesn't have enough bandwidth
   *
   * Some of those reasons are indicated in {@link TrackContext.encodingReason}.
   */
  encodingChanged: (context: TrackContext<EndpointMetadata, TrackMetadata>) => void;

  /**
   * Emitted every time an update about voice activity is received from the server.
   */
  voiceActivityChanged: (context: TrackContext<EndpointMetadata, TrackMetadata>) => void;
}

export interface TrackContext<EndpointMetadata, TrackMetadata>
  extends TrackContextFields<EndpointMetadata, TrackMetadata>,
    TypedEmitter<Required<TrackContextEvents<EndpointMetadata, TrackMetadata>>> {}

export type TrackNegotiationStatus = 'awaiting' | 'offered' | 'done';

/**
 * Type describing possible track encodings.
 * - `"h"` - original encoding
 * - `"m"` - original encoding scaled down by 2
 * - `"l"` - original encoding scaled down by 4
 *
 * Notice that to make all encodings work, the initial
 * resolution has to be at least 1280x720.
 * In other case, browser might not be able to scale
 * some encodings down.
 */
export type Encoding = 'l' | 'm' | 'h';

const trackEncodings = ['l', 'm', 'h'] as const;

export const isEncoding = (encoding: string): encoding is Encoding => trackEncodings.includes(encoding as Encoding);

/**
 * Events emitted by the {@link WebRTCEndpoint} instance.
 */
export interface WebRTCEndpointEvents<EndpointMetadata, TrackMetadata> {
  /**
   * Emitted each time WebRTCEndpoint need to send some data to the server.
   */
  sendMediaEvent: (mediaEvent: SerializedMediaEvent) => void;

  /**
   * Emitted when endpoint of this {@link WebRTCEndpoint} instance is ready. Triggered by {@link WebRTCEndpoint.connect}
   */
  connected: (endpointId: string, otherEndpoints: Endpoint<EndpointMetadata, TrackMetadata>[]) => void;

  /**
   * Emitted when endpoint of this {@link WebRTCEndpoint} instance was removed.
   */
  disconnected: () => void;

  /**
   * Emitted when data in a new track arrives.
   *
   * This event is always emitted after {@link trackAdded}.
   * It informs the user that data related to the given track arrives and can be played or displayed.
   */
  trackReady: (ctx: TrackContext<EndpointMetadata, TrackMetadata>) => void;

  /**
   * Emitted each time the endpoint which was already in the room, adds new track. Fields track and stream will be set to null.
   * These fields will be set to non-null value in {@link trackReady}
   */
  trackAdded: (ctx: TrackContext<EndpointMetadata, TrackMetadata>) => void;

  /**
   * Emitted when some track will no longer be sent.
   *
   * It will also be emitted before {@link endpointRemoved} for each track of this endpoint.
   */
  trackRemoved: (ctx: TrackContext<EndpointMetadata, TrackMetadata>) => void;

  /**
   * Emitted each time endpoint has its track metadata updated.
   */
  trackUpdated: (ctx: TrackContext<EndpointMetadata, TrackMetadata>) => void;

  /**
   * Emitted each time new endpoint is added to the room.
   */
  endpointAdded: (endpoint: Endpoint<EndpointMetadata, TrackMetadata>) => void;

  /**
   * Emitted each time endpoint is removed, emitted only for other endpoints.
   */
  endpointRemoved: (endpoint: Endpoint<EndpointMetadata, TrackMetadata>) => void;

  /**
   * Emitted each time endpoint has its metadata updated.
   */
  endpointUpdated: (endpoint: Endpoint<EndpointMetadata, TrackMetadata>) => void;

  /**
   * Emitted in case of errors related to multimedia session e.g. ICE connection.
   */
  connectionError: (error: { message: string; event: Event }) => void;

  /**
   * Emitted in case of errors related to multimedia session e.g. ICE connection.
   */
  signalingError: (error: { message: string }) => void;

  /**
   * Currently, this event is only emitted when DisplayManager in RTC Engine is
   * enabled and simulcast is disabled.
   *
   * Emitted when priority of video tracks have changed.
   * @param enabledTracks - list of tracks which will be sent to client from SFU
   * @param disabledTracks - list of tracks which will not be sent to client from SFU
   */
  tracksPriorityChanged: (
    enabledTracks: TrackContext<EndpointMetadata, TrackMetadata>[],
    disabledTracks: TrackContext<EndpointMetadata, TrackMetadata>[],
  ) => void;

  /**
   * Emitted every time the server estimates client's bandwidth.
   *
   * @param {bigint} estimation - client's available incoming bitrate estimated
   * by the server. It's measured in bits per second.
   */
  bandwidthEstimationChanged: (estimation: bigint) => void;

  /**
   * Emitted each time track encoding has been disabled.
   */
  trackEncodingDisabled: (context: TrackContext<EndpointMetadata, TrackMetadata>, encoding: string) => void;

  /**
   * Emitted each time track encoding has been enabled.
   */
  trackEncodingEnabled: (context: TrackContext<EndpointMetadata, TrackMetadata>, encoding: string) => void;

  targetTrackEncodingRequested: (event: { trackId: string; variant: Encoding }) => void;

  disconnectRequested: (event: any) => void;

  localTrackAdded: (event: {
    trackId: string;
    track: MediaStreamTrack;
    stream: MediaStream;
    trackMetadata?: TrackMetadata;
    simulcastConfig: SimulcastConfig;
    maxBandwidth: TrackBandwidthLimit;
  }) => void;

  localTrackRemoved: (event: { trackId: string }) => void;

  localTrackReplaced: (event: { trackId: string; track: MediaStreamTrack | null }) => void;

  localTrackMuted: (event: { trackId: string }) => void;

  localTrackUnmuted: (event: { trackId: string }) => void;

  localTrackBandwidthSet: (event: { trackId: string; bandwidth: BandwidthLimit }) => void;

  localTrackEncodingBandwidthSet: (event: { trackId: string; rid: string; bandwidth: BandwidthLimit }) => void;

  localTrackEncodingEnabled: (event: { trackId: string; encoding: Encoding }) => void;

  localTrackEncodingDisabled: (event: { trackId: string; encoding: Encoding }) => void;

  localEndpointMetadataChanged: (event: { metadata: { peer?: EndpointMetadata; server?: unknown } }) => void;

  localTrackMetadataChanged: (event: { trackId: string; metadata: TrackMetadata }) => void;
}

export type Config<EndpointMetadata, TrackMetadata> = {
  endpointMetadataParser?: MetadataParser<EndpointMetadata>;
  trackMetadataParser?: MetadataParser<TrackMetadata>;
};

/**
 * Interface describing Endpoint.
 */
export interface Endpoint<EndpointMetadata, TrackMetadata> {
  /**
   * Endpoint's id. It is assigned by user in custom logic that use backend API.
   */
  id: string;
  /**
   * Type of the endpoint, e.g. "webrtc", "hls" or "rtsp".
   */
  type: string;
  /**
   * Any information that was provided in {@link WebRTCEndpoint.connect}.
   */
  metadata: {
    peer?: EndpointMetadata;
    server: any;
  };
  rawMetadata: {
    peer?: any;
    server: any;
  };
  metadataParsingError?: any;
  /**
   * List of tracks that are sent by the endpoint.
   */
  tracks: Map<string, TrackContext<EndpointMetadata, TrackMetadata>>;
}
