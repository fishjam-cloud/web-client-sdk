import { expect, it } from 'vitest';

import { WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
import {
  createConnectedEventWithOneEndpoint,
  createEndpointRemoved,
  endpointId,
  notExistingEndpointId,
  trackId,
} from '../fixtures';
import { mockRTCPeerConnection } from '../mocks';
import { setupRoom } from '../utils';

it('Remove the endpoint that does not exist', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint(endpointId) }),
  );

  // When
  expect(() =>
    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({ endpointRemoved: createEndpointRemoved(notExistingEndpointId) }),
    ),
  )
    // Then
    .rejects.toThrow(`Endpoint ${notExistingEndpointId} not found`);
});

it('Remove current peer', () =>
  new Promise((done) => {
    // Given
    mockRTCPeerConnection();
    const webRTCEndpoint = new WebRTCEndpoint();
    const currentPeerId = 'currentPeerId';

    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint(endpointId, currentPeerId) }),
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

it('Remove existing endpoint should remove it from remote endpoints', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint(endpointId) }),
  );

  // When
  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ endpointRemoved: createEndpointRemoved(endpointId) }));
  // Then
  const endpoints = webRTCEndpoint.getRemoteEndpoints();
  expect(Object.values(endpoints).length).toBe(0);
});

it('Remove existing endpoint should remove all tracks', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, endpointId, trackId);

  // When
  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ endpointRemoved: createEndpointRemoved(endpointId) }));

  // Then
  const tracks = webRTCEndpoint.getRemoteTracks();
  expect(Object.values(tracks).length).toBe(0);
});

it('Remove existing endpoint should emit trackRemoved event', () =>
  new Promise((done) => {
    // Given
    mockRTCPeerConnection();
    const webRTCEndpoint = new WebRTCEndpoint();

    setupRoom(webRTCEndpoint, endpointId, trackId);

    webRTCEndpoint.on('trackRemoved', (trackContext) => {
      // Then
      expect(trackContext.trackId).toBe(trackId);
      done('');
    });

    // When
    webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ endpointRemoved: createEndpointRemoved(endpointId) }));
  }));
