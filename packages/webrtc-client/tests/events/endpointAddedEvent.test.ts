import { expect, it } from 'vitest';

import { WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
import {
  createConnectedEvent,
  createConnectedEventWithOneEndpoint,
  createEndpointAdded,
  exampleEndpointId,
} from '../fixtures';
import { mockRTCPeerConnection } from '../mocks';

it('Add endpoint to empty state', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected: createConnectedEvent() }));

  // When
  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ endpointAdded: createEndpointAdded(exampleEndpointId) }),
  );

  // Then
  const endpoints = webRTCEndpoint.getRemoteEndpoints();
  expect(Object.values(endpoints).length).toBe(1);
});

it('Add another endpoint', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint() }));

  // When
  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ endpointAdded: createEndpointAdded(exampleEndpointId) }),
  );

  // Then
  const endpoints = webRTCEndpoint.getRemoteEndpoints();
  expect(Object.values(endpoints).length).toBe(2);
});

it('Add endpoint produces event', () =>
  new Promise((done) => {
    // Given
    mockRTCPeerConnection();
    const webRTCEndpoint = new WebRTCEndpoint();

    webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint() }));

    const endpointAdded = createEndpointAdded(exampleEndpointId);

    webRTCEndpoint.on('endpointAdded', (endpoint) => {
      // Then
      expect(endpoint.id).toBe(endpointAdded.endpointId);
      expect(endpoint.metadata).toBe(undefined);
      done('');
    });

    // When
    webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ endpointAdded }));
  }));

it('Parses the metadata', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected: createConnectedEvent() }));

  const metadata = {
    goodStuff: 'ye',
  };

  // When
  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ endpointAdded: createEndpointAdded(exampleEndpointId, metadata) }),
  );

  // Then
  const endpoints: Record<string, any> = webRTCEndpoint.getRemoteEndpoints();
  const addedEndpoint = endpoints[exampleEndpointId];
  expect(addedEndpoint.metadata).toEqual(metadata);
});
