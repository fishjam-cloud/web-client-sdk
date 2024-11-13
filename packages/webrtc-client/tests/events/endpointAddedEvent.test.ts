import { mockRTCPeerConnection } from '../mocks';
import { WebRTCEndpoint } from '../../src';
import {
  createConnectedEvent,
  createConnectedEventWithOneEndpoint,
  createEndpointAdded,
  endpointId,
} from '../fixtures';
import { expect, it } from 'vitest';

it('Add endpoint to empty state', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createConnectedEvent()));

  // When
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createEndpointAdded(endpointId)));

  // Then
  const endpoints = webRTCEndpoint.getRemoteEndpoints();
  expect(Object.values(endpoints).length).toBe(1);
});

it('Add another endpoint', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createConnectedEventWithOneEndpoint()));

  // When
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createEndpointAdded(endpointId)));

  // Then
  const endpoints = webRTCEndpoint.getRemoteEndpoints();
  expect(Object.values(endpoints).length).toBe(2);
});

it('Add endpoint produces event', () =>
  new Promise((done) => {
    // Given
    mockRTCPeerConnection();
    const webRTCEndpoint = new WebRTCEndpoint();

    webRTCEndpoint.receiveMediaEvent(JSON.stringify(createConnectedEventWithOneEndpoint()));

    const addEndpointEvent = createEndpointAdded(endpointId);

    webRTCEndpoint.on('endpointAdded', (endpoint) => {
      // Then
      expect(endpoint.id).toBe(addEndpointEvent.data.id);
      expect(endpoint.metadata).toBe(addEndpointEvent.data.metadata);
      done('');
    });

    // When
    webRTCEndpoint.receiveMediaEvent(JSON.stringify(addEndpointEvent));
  }));

it('Parses the metadata', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createConnectedEvent()));

  // When
  webRTCEndpoint.receiveMediaEvent(
    JSON.stringify(
      createEndpointAdded(endpointId, {
        goodStuff: 'ye',
      }),
    ),
  );

  // Then
  const endpoints: Record<string, any> = webRTCEndpoint.getRemoteEndpoints();
  const addedEndpoint = endpoints[endpointId];
  expect(addedEndpoint.metadata).toEqual({ goodStuff: 'ye' });
});
