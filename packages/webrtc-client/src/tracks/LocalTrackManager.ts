import { type MediaEvent as PeerMediaEvent, MediaEvent_RenegotiateTracks } from '@fishjam-cloud/protobufs/peer';

import type { SimulcastConfig } from '..';
import type { ConnectionManager } from '../ConnectionManager';
import type { TrackBandwidthLimit } from '../types';
import type { WebRTCEndpoint } from '../webRTCEndpoint';
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
export class LocalTrackManager {
  public connection?: ConnectionManager;

  private readonly local: Local;

  public ongoingTrackReplacement: boolean = false;
  /**
   * Indicates if an ongoing renegotiation is active.
   * During renegotiation, both parties are expected to actively exchange events: renegotiateTracks, offerData, sdpOffer, sdpAnswer.
   */
  public ongoingRenegotiation: boolean = false;

  private readonly sendMediaEvent: (mediaEvent: PeerMediaEvent) => void;

  constructor(local: Local, sendMediaEvent: (mediaEvent: PeerMediaEvent) => void) {
    this.local = local;
    this.sendMediaEvent = sendMediaEvent;
  }

  public isNegotiationInProgress = () => {
    return this.ongoingRenegotiation || this.ongoingTrackReplacement;
  };

  public cleanUp = () => {
    this.ongoingTrackReplacement = false;
    this.ongoingRenegotiation = false;
  };

  public parseAddTrack = (
    track: MediaStreamTrack,
    simulcastConfig: SimulcastConfig,
    maxBandwidth: TrackBandwidthLimit,
  ) => {
    if (this.getEndpointId() === '') {
      throw new Error('Cannot add tracks before being accepted by the server');
    }

    if (!simulcastConfig.enabled && !(typeof maxBandwidth === 'number')) {
      throw new Error('Invalid type of `maxBandwidth` argument for a non-simulcast track, expected: number');
    }

    if (this.connection?.isTrackInUse(track)) {
      throw new Error("This track was already added to peerConnection, it can't be added again!");
    }
  };

  public addTrackHandler = (
    trackId: string,
    track: MediaStreamTrack,
    stream: MediaStream,
    trackMetadata: unknown | undefined,
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
    }

    this.sendMediaEvent({ renegotiateTracks: MediaEvent_RenegotiateTracks.create() });
  };

  public removeTrackHandler = (trackId: string) => {
    if (!this.connection) throw new Error(`There is no active RTCPeerConnection`);

    this.ongoingRenegotiation = true;

    this.local.removeTrack(trackId);
  };

  public replaceTrackHandler = async (
    webrtc: WebRTCEndpoint,
    trackId: string,
    newTrack: MediaStreamTrack | null,
  ): Promise<void> => {
    this.ongoingTrackReplacement = true;
    try {
      await this.local.replaceTrack(webrtc, trackId, newTrack);
    } finally {
      this.ongoingTrackReplacement = false;
    }
  };

  public getEndpointId = () => this.local.getEndpoint().id;

  public updateConnection = (connection: ConnectionManager) => {
    this.connection = connection;
  };

  public updateSenders = () => {
    this.local.updateSenders();
  };
}
