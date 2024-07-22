import type { TrackCommon, TrackEncodings, TrackId } from './TrackCommon';
import type { LocalTrackId, MLineId, Encoding } from '../types';
import type { TrackContextImpl } from '../internal';
import { isTrackKind } from '../internal';

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
export class RemoteTrack<EndpointMetadata, TrackMetadata>
  implements TrackCommon
{
  public id: TrackId;
  public mLineId: MLineId | null = null;
  public readonly trackContext: TrackContextImpl<
    EndpointMetadata,
    TrackMetadata
  >;
  public readonly encodings: TrackEncodings = { h: false, m: false, l: false };
  // todo this field is not exposed
  private targetEncoding: Encoding | null = null;

  constructor(
    id: LocalTrackId,
    trackContext: TrackContextImpl<EndpointMetadata, TrackMetadata>,
  ) {
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

  public disableTrackEncoding = (encoding: Encoding) => {
    this.encodings[encoding] = false;
  };

  public enableTrackEncoding = (encoding: Encoding) => {
    this.encodings[encoding] = true;
  };

  public setTargetTrackEncoding = (variant: Encoding) => {
    // todo implement validation
    this.targetEncoding = variant;

    const trackContext = this.trackContext;

    if (!trackContext.simulcastConfig?.enabled) {
      throw new Error('The track does not support changing its target variant');
    }

    const isValidTargetEncoding =
      !trackContext.simulcastConfig.activeEncodings.includes(variant);

    if (isValidTargetEncoding) {
      throw new Error(`The track does not support variant ${variant}`);
    }
  };
}
