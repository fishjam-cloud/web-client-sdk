import type { SimulcastConfig, TrackBandwidthLimit } from '../types';
import { generateCustomEvent } from '../mediaEvent';
import type { WebRTCEndpoint } from '../webRTCEndpoint';
import type { ConnectionManager } from '../ConnectionManager';
import type { Local } from './Local';

/**
 * This class is responsible for handling asynchronous operations related to track management.
 * It contains methods and state associated with handling a single operation
 * (adding, removing, and replacing a track).
 * It facilitates the preparation of events that will later be handled by the `CommandsQueue`.
 * It informs the `CommandsQueue` whether the previous task has been completed
 *
 * Adding and removing tracks requires renegotiation.
 *
 * Replacing a track relies on `ongoingTrackReplacement`, which probably could be removed
 * and replaced with a Promise, because it does not require renegotiation.
 */
export class LocalTrackManager<EndpointMetadata, TrackMetadata> {
  public connection?: ConnectionManager;

  private readonly local: Local<EndpointMetadata, TrackMetadata>;

  public ongoingTrackReplacement: boolean = false;
  /**
   * Indicates if an ongoing renegotiation is active.
   * During renegotiation, both parties are expected to actively exchange events: renegotiateTracks, offerData, sdpOffer, sdpAnswer.
   */
  public ongoingRenegotiation: boolean = false;

  // temporary for webrtc.emit and webrtc.sendMediaEvent
  private readonly webrtc: WebRTCEndpoint<EndpointMetadata, TrackMetadata>;

  constructor(
    webrtc: WebRTCEndpoint<EndpointMetadata, TrackMetadata>,
    local: Local<EndpointMetadata, TrackMetadata>,
  ) {
    this.webrtc = webrtc;
    this.local = local;
  }

  public isNegotiationInProgress = () => {
    return this.ongoingRenegotiation || this.ongoingTrackReplacement;
  };

  public cleanUp = () => {
    this.ongoingTrackReplacement = false;
    this.ongoingRenegotiation = false;
  };

  public validateAddTrack = (
    track: MediaStreamTrack,
    simulcastConfig: SimulcastConfig,
    maxBandwidth: TrackBandwidthLimit,
  ): string | null => {
    if (this.getEndpointId() === '') {
      return 'Cannot add tracks before being accepted by the server';
    }

    if (!simulcastConfig.enabled && !(typeof maxBandwidth === 'number')) {
      return 'Invalid type of `maxBandwidth` argument for a non-simulcast track, expected: number';
    }

    if (this.connection?.isTrackInUse(track)) {
      return "This track was already added to peerConnection, it can't be added again!";
    }

    return null;
  };

  public addTrackHandler = (
    trackId: string,
    track: MediaStreamTrack,
    stream: MediaStream,
    trackMetadata: TrackMetadata | undefined,
    simulcastConfig: SimulcastConfig,
    maxBandwidth: TrackBandwidthLimit,
  ) => {
    this.ongoingRenegotiation = true;

    const trackManager = this.local.addTrack(
      this.connection,
      trackId,
      track,
      stream,
      trackMetadata,
      simulcastConfig,
      maxBandwidth,
    );

    if (this.connection) {
      trackManager.addTrackToConnection();
      this.connection.setTransceiverDirection();
    }

    const mediaEvent = generateCustomEvent({ type: 'renegotiateTracks' });
    this.webrtc.sendMediaEvent(mediaEvent);
  };

  public removeTrackHandler = (trackId: string) => {
    if (!this.connection)
      throw new Error(`There is no active RTCPeerConnection`);

    this.ongoingRenegotiation = true;

    this.local.removeTrack(trackId);
  };

  public replaceTrackHandler = async (
    trackId: string,
    newTrack: MediaStreamTrack | null,
    newTrackMetadata?: TrackMetadata,
  ): Promise<void> => {
    this.ongoingTrackReplacement = true;
    try {
      await this.local.replaceTrack(trackId, newTrack, newTrackMetadata);
    } catch (e) {
      this.ongoingTrackReplacement = false;
    }
    this.ongoingTrackReplacement = false;
  };

  public getEndpointId = () => this.local.getEndpoint().id;

  public updateConnection = (connection: ConnectionManager) => {
    this.connection = connection;
  };

  public updateSenders = () => {
    this.local.updateSenders();
  };
}
