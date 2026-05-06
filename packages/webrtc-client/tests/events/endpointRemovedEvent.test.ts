import { expect, it } from 'vitest';

import { WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
import {
  createConnectedEventWithOneEndpoint,
  createEndpointRemoved,
  exampleEndpointId,
  exampleTrackId,
  notExistingEndpointId,
} from '../fixtures';
import { mockRTCPeerConnection } from '../mocks';
import { setupRoom } from '../utils';

it('Remove the endpoint that does not exist', async () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint(exampleEndpointId) }),
  );

  // Then
  await expect(() =>
    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({ endpointRemoved: createEndpointRemoved(notExistingEndpointId) }),
    ),
  ).rejects.toThrow(`Endpoint ${notExistingEndpointId} not found`);
});

it('Remove current peer', () =>
  new Promise((done) => {
    // Given
    mockRTCPeerConnection();
    const webRTCEndpoint = new WebRTCEndpoint();
    const currentPeerId = 'currentPeerId';

    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint(exampleEndpointId, currentPeerId) }),
    );

    webRTCEndpoint.on('disconnected', () => {
      // Then
      done('');
    });

    // When
    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({ endpointRemoved: createEndpointRemoved(currentPeerId) }),
    );
  }));

it('Remove existing endpoint should remove it from remote endpoints', async () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint(exampleEndpointId) }),
  );

  // When
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ endpointRemoved: createEndpointRemoved(exampleEndpointId) }),
  );
  // Then
  const endpoints = webRTCEndpoint.getRemoteEndpoints();
  expect(Object.values(endpoints).length).toBe(0);
});

it('Remove existing endpoint should remove all tracks', async () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  // When
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ endpointRemoved: createEndpointRemoved(exampleEndpointId) }),
  );

  // Then
  const tracks = webRTCEndpoint.getRemoteTracks();
  expect(Object.values(tracks).length).toBe(0);
});

it('Remove existing endpoint should emit trackRemoved event', async () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  const removed: string[] = [];
  webRTCEndpoint.on('trackRemoved', (trackContext) => {
    removed.push(trackContext.trackId);
  });

  // When
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ endpointRemoved: createEndpointRemoved(exampleEndpointId) }),
  );

  // Then
  expect(removed).toEqual([exampleTrackId]);
});
