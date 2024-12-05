// import { WebRTCEndpoint } from '../../src';
// import {  endpointId, trackId } from '../fixtures';
// import { setupRoom } from '../utils';
// import { expect, it } from 'vitest';

// TODO Add the test back once the bandwidth estimation event is implemented
// it('Change existing track bandwidth estimation', () =>
//   new Promise((done) => {
//     // Given
//     const webRTCEndpoint = new WebRTCEndpoint();

//     setupRoom(webRTCEndpoint, endpointId, trackId);
//     const bandwidthEstimationEvent = createBandwidthEstimationEvent();

//     webRTCEndpoint.on('bandwidthEstimationChanged', (estimation) => {
//       // Then
//       expect(estimation).toBe(bandwidthEstimationEvent.data.data.estimation);
//       done('');
//     });

//     // When
//     webRTCEndpoint.receiveMediaEvent(JSON.stringify(bandwidthEstimationEvent));
//   }));
import { describe } from 'vitest';

describe.skip('Skipping bandwidth estimation, not yet implemented in Fishjam', () => {});
