import type { TrackContextImpl } from '../internal';
import type {
  BandwidthLimit,
  Encoding,
  LocalTrackId,
  MediaStreamTrackId,
  MetadataParser,
  MLineId,
  TrackKind,
} from '../types';
import type { TrackCommon, TrackEncodings, TrackId } from './TrackCommon';
import { generateCustomEvent, generateMediaEvent } from '../mediaEvent';
import type { WebRTCEndpoint } from '../webRTCEndpoint';
import type { Bitrate, Bitrates } from '../bitrate';
import {
  defaultBitrates,
  defaultSimulcastBitrates,
  UNLIMITED_BANDWIDTH,
} from '../bitrate';
import type { ConnectionManager } from '../ConnectionManager';
import { getEncodingParameters } from './encodings';
import { createTransceiverConfig } from './transceivers';

/**
 * This is a wrapper over `TrackContext` that adds additional properties such as:
 * - `MLineId`: required to generate sdpOffer
 * - `MediaStreamTrackId`: required to generate sdpOffer and match RTCRtpSender
 * - `RTCRtpSender`: required to manage RTCPeerConnection track, e.g.:
 *   - enable/disable encoding
 *   - remove from connection
 *   - replace track
 *   - set track bandwidth
 *
 * In the future, this object could potentially be merged with `TrackContextImpl`.
 *
 * # Lifecycle, state transitions
 *
 * I identified the following states
 * - Before creating `Connection` object
 *   - connection === null
 *   - sender === null
 *   - mLineId === null
 * - After creating `Connection` object, during `onOfferData` handler
 *   // TODO: Verify if the track acquires a sender at this point or if it's only for past tracks
 *   - connection !== null
 *   - sender !== null
 *   - mLineId === null
 * - After establishing connection, during `onSdpAnswer`, track is being sent
 *   - connection !== null
 *   - sender !== null
 *   - mLineId !== null
 */
export class LocalTrack<EndpointMetadata, TrackMetadata>
  implements TrackCommon
{
  public readonly id: TrackId;
  public mediaStreamTrackId: MediaStreamTrackId | null = null;
  public mLineId: MLineId | null = null;
  public readonly trackContext: TrackContextImpl<
    EndpointMetadata,
    TrackMetadata
  >;
  private sender: RTCRtpSender | null = null;
  public readonly encodings: TrackEncodings;

  private readonly metadataParser: MetadataParser<TrackMetadata>;

  public connection: ConnectionManager | undefined;

  constructor(
    connection: ConnectionManager | undefined,
    id: LocalTrackId,
    trackContext: TrackContextImpl<EndpointMetadata, TrackMetadata>,
    metadataParser: MetadataParser<TrackMetadata>,
  ) {
    this.connection = connection;
    this.id = id;
    this.trackContext = trackContext;

    // todo maybe we could remove this object and use sender.getParameters().encodings.encodingParameter.active instead
    this.encodings = { h: true, m: true, l: true };
    if (trackContext.track?.id) {
      this.mediaStreamTrackId = trackContext.track?.id;
    }
    this.metadataParser = metadataParser;
  }

  public updateSender = () => {
    if (this.mediaStreamTrackId && this.connection) {
      this.sender = this.connection.findSender(this.mediaStreamTrackId);
    }
  };

  public updateConnection = (connection: ConnectionManager) => {
    this.connection = connection;
  };

  public disableTrackEncoding = async (encoding: Encoding) => {
    if (!this.sender)
      throw new Error(`RTCRtpSender for track ${this.id} not found`);

    const params = this.sender.getParameters();
    const encodings = params.encodings;

    const encodingParameter = encodings.find((en) => en.rid == encoding);

    if (!encodingParameter)
      throw new Error(
        `RTCRtpEncodingParameters for track ${this.id} not found`,
      );

    encodingParameter.active = false;
    this.encodings[encoding] = false;

    await this.sender.setParameters(params);
  };

  public addTrackToConnection = () => {
    if (!this.trackContext.track)
      throw Error(`MediaStreamTrack for track ${this.id} does not exist`);

    if (!this.connection)
      throw new Error(`There is no active RTCPeerConnection`);

    const transceiverConfig = createTransceiverConfig(this.trackContext);

    this.updateEncodings();

    this.connection.addTransceiver(this.trackContext.track, transceiverConfig);
  };

  // 1
  private updateEncodings = () => {
    if (
      this.trackContext?.track?.kind === 'video' &&
      this.trackContext.simulcastConfig?.activeEncodings
    ) {
      const activeEncodings = this.trackContext.simulcastConfig.activeEncodings;

      this.encodings.l = activeEncodings.some((e) => e === 'l');
      this.encodings.m = activeEncodings.some((e) => e === 'm');
      this.encodings.h = activeEncodings.some((e) => e === 'h');
    }
  };

  public removeFromConnection = () => {
    if (!this.sender)
      throw new Error(`RTCRtpSender for track ${this.id} not found`);
    if (!this.connection)
      throw new Error(`There is no active RTCPeerConnection`);

    this.connection.removeTrack(this.sender);
  };

  // TODO: Remove `newTrackMetadata` parameter because this function should be an atomic operation.
  //  Metadata are updated after `await this.sender.replaceTrack(newTrack)`,
  //  so it could be chained by the user.
  public replaceTrack = async (
    newTrack: MediaStreamTrack | null,
    // todo remove webrtc with newTrackMetadata
    newTrackMetadata: TrackMetadata | undefined,
    // todo remove webrtc with newTrackMetadata
    webrtc: WebRTCEndpoint<EndpointMetadata, TrackMetadata>,
  ): Promise<void> => {
    const trackId = this.id;
    const stream = this.trackContext.stream;

    if (!this.sender)
      throw Error('There is no RTCRtpSender for this track id!');

    stream?.getTracks().forEach((track) => {
      stream?.removeTrack(track);
    });

    if (newTrack) {
      stream?.addTrack(newTrack);
    }

    if (this.trackContext.track && !newTrack) {
      const mediaEvent = generateMediaEvent('muteTrack', { trackId: trackId });
      webrtc.sendMediaEvent(mediaEvent);
      webrtc.emit('localTrackMuted', { trackId: trackId });
    } else if (!this.trackContext.track && newTrack) {
      const mediaEvent = generateMediaEvent('unmuteTrack', {
        trackId: trackId,
      });
      webrtc.sendMediaEvent(mediaEvent);
      webrtc.emit('localTrackUnmuted', { trackId: trackId });
    }

    this.mediaStreamTrackId = newTrack?.id ?? null;

    try {
      await this.sender.replaceTrack(newTrack);
      this.trackContext.track = newTrack;

      if (newTrackMetadata) {
        webrtc.updateTrackMetadata(trackId, newTrackMetadata);
      }
    } catch (error) {
      // ignore
    }
  };

  public setTrackBandwidth = (bandwidth: BandwidthLimit): Promise<void> => {
    if (!this.sender)
      throw new Error(`RTCRtpSender for track ${this.id} not found`);

    const parameters = this.sender.getParameters();

    parameters.encodings = getEncodingParameters(parameters, bandwidth);

    return this.sender.setParameters(parameters);
  };

  public setEncodingBandwidth(
    rid: Encoding,
    bandwidth: BandwidthLimit,
  ): Promise<void> {
    if (!this.sender)
      throw new Error(`RTCRtpSender for track ${this.id} not found`);

    const parameters = this.sender.getParameters();
    const encoding = parameters.encodings.find(
      (encoding) => encoding.rid === rid,
    );

    if (!encoding) {
      return Promise.reject(`Encoding with rid '${rid}' doesn't exist`);
    } else if (bandwidth === 0) {
      delete encoding.maxBitrate;
    } else {
      encoding.maxBitrate = bandwidth * 1024;
    }

    return this.sender.setParameters(parameters);
  }

  public updateTrackMetadata = (metadata: unknown) => {
    const trackContext = this.trackContext;

    try {
      trackContext.metadata = this.metadataParser(metadata);
      trackContext.rawMetadata = metadata;
      trackContext.metadataParsingError = undefined;
    } catch (error) {
      trackContext.metadata = undefined;
      trackContext.metadataParsingError = error;
      throw error;
    }
  };

  public enableTrackEncoding = (encoding: Encoding) => {
    if (!this.sender)
      throw new Error(`RTCRtpSender for track ${this.id} not found`);

    const params = this.sender.getParameters();
    const encodingParameters = params.encodings.find(
      (en) => en.rid == encoding,
    );

    if (!encodingParameters)
      throw new Error(
        `RTCRtEncodingParameters ${encoding} for track ${this.id} not found`,
      );

    encodingParameters.active = true;
    this.encodings[encoding] = true;

    return this.sender.setParameters(params);
  };

  public getDisabledEncodings = (): Encoding[] => {
    return Object.entries(this.encodings)
      .filter(([_, value]) => !value)
      .map(([encoding]) => encoding as Encoding)
      .reduce((acc, encoding) => [...acc, encoding], [] as Encoding[]);
  };

  public setMLineId = (mLineId: MLineId) => {
    this.mLineId = mLineId;
  };

  private isNotSimulcastTrack = (
    encodings: RTCRtpEncodingParameters[],
  ): boolean => encodings.length === 1 && !encodings[0]!.rid;

  public getTrackBitrates = (): Bitrates => {
    const trackContext = this.trackContext;
    const kind = this.trackContext.track?.kind as TrackKind | undefined;

    if (!trackContext.track) {
      if (!trackContext.trackKind) {
        throw new Error('trackContext.trackKind is empty');
      }

      return defaultBitrates[trackContext.trackKind];
    }

    if (!this.sender)
      throw new Error(`RTCRtpSender for track ${this.id} not found`);

    const encodings = this.sender.getParameters().encodings;

    if (this.isNotSimulcastTrack(encodings)) {
      return (
        encodings[0]!.maxBitrate ||
        (kind ? defaultBitrates[kind] : UNLIMITED_BANDWIDTH)
      );
    } else if (kind === 'audio') {
      throw 'Audio track cannot have multiple encodings';
    }

    return encodings
      .filter((encoding) => encoding.rid)
      .reduce(
        (acc, encoding) => {
          const rid = encoding.rid! as Encoding;
          acc[rid] = encoding.maxBitrate || defaultSimulcastBitrates[rid];
          return acc;
        },
        {} as Record<string, Bitrate>,
      );
  };

  public createTrackVariantBitratesEvent = () => {
    return generateCustomEvent({
      type: 'trackVariantBitrates',
      data: {
        trackId: this.id,
        variantBitrates: this.getTrackBitrates(),
      },
    });
  };
}
