import type { TrackCommon, TrackId } from './TrackCommon';
import type { LocalTrackId, MLineId } from '../types';
import type { TrackContextImpl } from '../internal';
import { isTrackKind } from '../internal';
import { Variant } from '@fishjam-cloud/protobufs/shared';

/**
 * This is a wrapper over `TrackContext` that adds additional properties such as:
 * - `MLineId`: required to generate sdpOffer
 *
 * # Lifecycle, state transitions
 *
 * I identified the following states
 * - on `trackAdded`
 *   - trackContext.stream === null
 *   - trackContext.track === null
 *   - trackContext.trackKind === null
 *   - mLineId === null
 * - on `onSdpAnswer`
 *   - trackContext.stream === null
 *   - trackContext.track === null
 *   - trackContext.trackKind === null
 *   - mLineId !== null
 * - on `trackReady`
 *   - trackContext.stream !== null
 *   - trackContext.track !== null
 *   - trackContext.trackKind !== null
 *   - mLineId !== null
 */
export class RemoteTrack implements TrackCommon {
  public id: TrackId;
  public mLineId: MLineId | null = null;
  public readonly trackContext: TrackContextImpl;
  public readonly encodings: Record<Variant, boolean> = {
    [Variant.UNRECOGNIZED]: false,
    [Variant.VARIANT_UNSPECIFIED]: false,
    [Variant.VARIANT_LOW]: false,
    [Variant.VARIANT_MEDIUM]: false,
    [Variant.VARIANT_HIGH]: false,
  };
  // todo this field is not exposed
  private targetEncoding: Variant | null = null;

  constructor(id: LocalTrackId, trackContext: TrackContextImpl) {
    this.id = id;
    this.trackContext = trackContext;
  }

  public setMLineId = (mLineId: MLineId) => {
    this.mLineId = mLineId;
  };

  public setReady = (stream: MediaStream, track: MediaStreamTrack) => {
    if (!isTrackKind(track.kind)) throw new Error('Track has no kind');

    this.trackContext.stream = stream;
    this.trackContext.track = track;
    this.trackContext.trackKind = track.kind;
  };

  public disableTrackEncoding = (encoding: Variant) => {
    this.encodings[encoding] = false;
  };

  public enableTrackEncoding = (encoding: Variant) => {
    this.encodings[encoding] = true;
  };

  public setTargetTrackEncoding = (variant: Variant) => {
    // todo implement validation
    this.targetEncoding = variant;

    const trackContext = this.trackContext;

    if (!trackContext.simulcastConfig?.enabled) {
      throw new Error('The track does not support changing its target variant');
    }

    const isValidTargetEncoding = !trackContext.simulcastConfig.enabledVariants.includes(variant);

    if (isValidTargetEncoding) {
      throw new Error(`The track does not support variant ${variant}`);
    }
  };
}
