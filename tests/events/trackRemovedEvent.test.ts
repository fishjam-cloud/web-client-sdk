import { WebRTCEndpoint } from '../../src';
import { createTracksRemovedEvent, endpointId, trackId } from '../fixtures';
import { setupRoomWithMocks } from '../utils';
import { expect, it } from 'vitest';

it('Remove tracks event should emit event', () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();

    setupRoomWithMocks(webRTCEndpoint, endpointId, trackId);

    webRTCEndpoint.on('trackRemoved', (trackContext) => {
      // Then
      expect(trackContext.trackId).toBe(trackId);
      done('');
    });

    // When
    const addEndpointEvent = createTracksRemovedEvent(endpointId, [trackId]);
    webRTCEndpoint.receiveMediaEvent(JSON.stringify(addEndpointEvent));
  }));

it('Remove tracks event should remove from local state', () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoomWithMocks(webRTCEndpoint, endpointId, trackId);

  // When
  const addEndpointEvent = createTracksRemovedEvent(endpointId, [trackId]);
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(addEndpointEvent));

  const tracks = webRTCEndpoint.getRemoteTracks();
  expect(Object.values(tracks).length).toBe(0);
});
