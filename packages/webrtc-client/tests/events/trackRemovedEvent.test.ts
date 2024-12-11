import { expect, it } from 'vitest';

import { WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
import { createTracksRemovedEvent, exampleEndpointId, exampleTrackId } from '../fixtures';
import { setupRoomWithMocks } from '../utils';

it('Remove tracks event should emit event', () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();

    setupRoomWithMocks(webRTCEndpoint, exampleEndpointId, exampleTrackId);

    webRTCEndpoint.on('trackRemoved', (trackContext) => {
      // Then
      expect(trackContext.trackId).toBe(exampleTrackId);
      done('');
    });

    // When
    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({ tracksRemoved: createTracksRemovedEvent(exampleEndpointId, [exampleTrackId]) }),
    );
  }));

it('Remove tracks event should remove from local state', () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoomWithMocks(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  // When
  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ tracksRemoved: createTracksRemovedEvent(exampleEndpointId, [exampleTrackId]) }),
  );

  const tracks = webRTCEndpoint.getRemoteTracks();
  expect(Object.values(tracks).length).toBe(0);
});
