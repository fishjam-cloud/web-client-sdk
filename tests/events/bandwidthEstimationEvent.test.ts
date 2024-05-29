import { WebRTCEndpoint } from '../../src';
import {
  createBandwidthEstimationEvent,
  endpointId,
  trackId,
} from '../fixtures';
import { setupRoom } from '../utils';
import { expect, it } from 'vitest';

it('Change existing track bandwidth estimation', () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();

    setupRoom(webRTCEndpoint, endpointId, trackId);
    const bandwidthEstimationEvent = createBandwidthEstimationEvent();

    webRTCEndpoint.on('bandwidthEstimationChanged', (estimation) => {
      // Then
      expect(estimation).toBe(bandwidthEstimationEvent.data.data.estimation);
      done('');
    });

    // When
    webRTCEndpoint.receiveMediaEvent(JSON.stringify(bandwidthEstimationEvent));
  }));
