import { Variant } from '@fishjam-cloud/protobufs/shared';

import type { Bitrate, Bitrates } from '../bitrate';
import { defaultBitrates, defaultSimulcastBitrates, UNLIMITED_BANDWIDTH } from '../bitrate';
import type { ConnectionManager } from '../ConnectionManager';
import type { TrackContextImpl } from '../internal';
import type { BandwidthLimit, LocalTrackId, MediaStreamTrackId, MLineId, TrackKind } from '../types';
// import { generateCustomEvent } from '../mediaEvent';
import type { WebRTCEndpoint } from '../webRTCEndpoint';
import { encodingToVariantMap, getEncodingParameters } from './encodings';
import { emitMutableEvents, getActionType } from './muteTrackUtils';
import type { TrackCommon, TrackEncodings, TrackId } from './TrackCommon';
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
export class LocalTrack implements TrackCommon {
  public readonly id: TrackId;
  public mediaStreamTrackId: MediaStreamTrackId | null = null;
  public mLineId: MLineId | null = null;
  public readonly trackContext: TrackContextImpl;
  private sender: RTCRtpSender | null = null;
  public readonly encodings: TrackEncodings = {
    [Variant.UNRECOGNIZED]: false,
    [Variant.VARIANT_UNSPECIFIED]: false,
    [Variant.VARIANT_LOW]: false,
    [Variant.VARIANT_MEDIUM]: false,
    [Variant.VARIANT_HIGH]: false,
  };

  public connection: ConnectionManager | undefined;

  constructor(connection: ConnectionManager | undefined, id: LocalTrackId, trackContext: TrackContextImpl) {
    this.connection = connection;
    this.id = id;
    this.trackContext = trackContext;

    // todo maybe we could remove this object and use sender.getParameters().encodings.encodingParameter.active instead
    if (trackContext.track?.id) {
      this.mediaStreamTrackId = trackContext.track?.id;
    }
  }

  public updateSender = () => {
    if (this.mediaStreamTrackId && this.connection) {
      this.sender = this.connection.findSender(this.mediaStreamTrackId);
    }
  };

  public updateConnection = (connection: ConnectionManager) => {
    this.connection = connection;
  };

  public disableTrackEncoding = async (encoding: Variant) => {
    if (!this.sender) throw new Error(`RTCRtpSender for track ${this.id} not found`);

    const params = this.sender.getParameters();
    const encodings = params.encodings;

    const encodingParameter = encodings.find((en) => en.rid && encodingToVariantMap[en.rid] === encoding);

    if (!encodingParameter) throw new Error(`RTCRtpEncodingParameters for track ${this.id} not found`);

    encodingParameter.active = false;
    this.encodings[encoding] = false;

    await this.sender.setParameters(params);
  };

  public addTrackToConnection = () => {
    if (!this.trackContext.track) throw Error(`MediaStreamTrack for track ${this.id} does not exist`);

    if (!this.connection) throw new Error(`There is no active RTCPeerConnection`);

    const transceiverConfig = createTransceiverConfig(this.trackContext);

    this.updateEncodings();

    this.connection.addTransceiver(this.trackContext.track, transceiverConfig);
  };

  private updateEncodings = () => {
    const enabledVariants = this.trackContext.simulcastConfig?.enabledVariants;
    if (this.trackContext?.track?.kind === 'video' && enabledVariants) {
      this.encodings[Variant.VARIANT_LOW] = enabledVariants.some((e) => e === Variant.VARIANT_LOW);
      this.encodings[Variant.VARIANT_MEDIUM] = enabledVariants.some((e) => e === Variant.VARIANT_MEDIUM);
      this.encodings[Variant.VARIANT_HIGH] = enabledVariants.some((e) => e === Variant.VARIANT_HIGH);
    }
  };

  public removeFromConnection = () => {
    if (!this.sender) throw new Error(`RTCRtpSender for track ${this.id} not found`);
    if (!this.connection) throw new Error(`There is no active RTCPeerConnection`);

    this.connection.removeTrack(this.sender);
  };

  public replaceTrack = async (newTrack: MediaStreamTrack | null, webrtc: WebRTCEndpoint): Promise<void> => {
    const trackId = this.id;
    const stream = this.trackContext.stream;
    const oldTrack = this.trackContext.track;

    if (!this.sender) throw Error('There is no RTCRtpSender for this track id!');

    stream?.getTracks().forEach((track) => {
      stream?.removeTrack(track);
    });

    if (newTrack) {
      stream?.addTrack(newTrack);
    }

    this.trackContext.track = newTrack;
    this.mediaStreamTrackId = newTrack?.id ?? null;

    const action = getActionType(this.trackContext.track, newTrack);
    if (action === 'mute' || action === 'unmute') {
      emitMutableEvents(action, webrtc, trackId);
    }

    try {
      await this.sender.replaceTrack(newTrack);
    } catch (_error) {
      // rollback: emit opposite events and revert internal state
      if (action === 'mute') {
        emitMutableEvents('unmute', webrtc, trackId);
      } else if (action === 'unmute') {
        emitMutableEvents('mute', webrtc, trackId);
      }

      this.trackContext.track = oldTrack;
      this.mediaStreamTrackId = oldTrack?.id ?? null;
    }
  };

  public setTrackBandwidth = (bandwidth: BandwidthLimit): Promise<void> => {
    if (!this.sender) throw new Error(`RTCRtpSender for track ${this.id} not found`);

    const parameters = this.sender.getParameters();

    parameters.encodings = getEncodingParameters(parameters, bandwidth);

    return this.sender.setParameters(parameters);
  };

  public setEncodingBandwidth(variant: Variant, bandwidth: BandwidthLimit): Promise<void> {
    if (!this.sender) throw new Error(`RTCRtpSender for track ${this.id} not found`);

    const parameters = this.sender.getParameters();
    const encoding = parameters.encodings.find(
      (encoding) => encoding.rid && encodingToVariantMap[encoding.rid] === variant,
    );

    if (!encoding) {
      return Promise.reject(`Encoding with Variant '${variant}' doesn't exist`);
    } else if (bandwidth === 0) {
      delete encoding.maxBitrate;
    } else {
      encoding.maxBitrate = bandwidth * 1024;
    }

    return this.sender.setParameters(parameters);
  }

  public updateTrackMetadata = (metadata: unknown) => {
    this.trackContext.metadata = metadata;
  };

  public enableTrackEncoding = (encoding: Variant) => {
    if (!this.sender) throw new Error(`RTCRtpSender for track ${this.id} not found`);

    const params = this.sender.getParameters();
    const encodingParameters = params.encodings.find((en) => en.rid && encodingToVariantMap[en.rid] === encoding);

    if (!encodingParameters) throw new Error(`RTCRtEncodingParameters ${encoding} for track ${this.id} not found`);

    encodingParameters.active = true;
    this.encodings[encoding] = true;

    return this.sender.setParameters(params);
  };

  public setMLineId = (mLineId: MLineId) => {
    this.mLineId = mLineId;
  };

  private isNotSimulcastTrack = (encodings: RTCRtpEncodingParameters[]): boolean =>
    encodings.length === 1 && !encodings[0]!.rid;

  public getTrackBitrates = (): Bitrates | undefined => {
    const trackContext = this.trackContext;
    const kind = this.trackContext.track?.kind as TrackKind | undefined;

    if (!trackContext.track) {
      if (!trackContext.trackKind) {
        throw new Error('trackContext.trackKind is empty');
      }

      return defaultBitrates[trackContext.trackKind];
    }

    if (!this.sender) return undefined;

    const encodings = this.sender.getParameters().encodings;

    if (this.isNotSimulcastTrack(encodings)) {
      return encodings[0]!.maxBitrate || (kind ? defaultBitrates[kind] : UNLIMITED_BANDWIDTH);
    } else if (kind === 'audio') {
      throw 'Audio track cannot have multiple encodings';
    }

    return encodings
      .filter((encoding) => encoding.rid)
      .reduce(
        (acc, encoding) => {
          const variant = encodingToVariantMap[encoding.rid!] ?? Variant.VARIANT_UNSPECIFIED;

          acc[variant] = encoding.maxBitrate || defaultSimulcastBitrates[variant];
          return acc;
        },
        {} as Record<Variant, Bitrate>,
      );
  };

  public createTrackVariantBitratesEvent = () => {
    // TODO implement this when simulcast is supported
    // return generateCustomEvent({
    //   type: 'trackVariantBitrates',
    //   data: {
    //     trackId: this.id,
    //     variantBitrates: this.getTrackBitrates(),
    //   },
    // });
  };
}
