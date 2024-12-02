import { WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
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
    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({ tracksRemoved: createTracksRemovedEvent(endpointId, [trackId]) }),
    );
  }));

it('Remove tracks event should remove from local state', () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoomWithMocks(webRTCEndpoint, endpointId, trackId);

  // When
  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ tracksRemoved: createTracksRemovedEvent(endpointId, [trackId]) }),
  );

  const tracks = webRTCEndpoint.getRemoteTracks();
  expect(Object.values(tracks).length).toBe(0);
});
