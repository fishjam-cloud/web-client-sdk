import { expect, it } from 'vitest';

import { WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
import { createTracksRemovedEvent, exampleEndpointId, exampleTrackId } from '../fixtures';
import { setupRoomWithMocks } from '../utils';

it('Remove tracks event should emit event', async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoomWithMocks(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  const removed: string[] = [];
  webRTCEndpoint.on('trackRemoved', (trackContext) => removed.push(trackContext.trackId));

  // When
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ tracksRemoved: createTracksRemovedEvent(exampleEndpointId, [exampleTrackId]) }),
  );

  // Then
  expect(removed).toEqual([exampleTrackId]);
});

it('Remove tracks event should remove from local state', async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoomWithMocks(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  // When
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ tracksRemoved: createTracksRemovedEvent(exampleEndpointId, [exampleTrackId]) }),
  );

  const tracks = webRTCEndpoint.getRemoteTracks();
  expect(Object.values(tracks).length).toBe(0);
});
