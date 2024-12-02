import { mockRTCPeerConnection } from '../mocks';
import { WebRTCEndpoint } from '../../src';
import {
  createConnectedEvent,
  createConnectedEventWithOneEndpoint,
  createEndpointUpdatedPeerMetadata,
  exampleEndpointId,
  notExistingEndpointId,
} from '../fixtures';
import { expect, it } from 'vitest';
import { serializeServerMediaEvent } from '../../src/mediaEvent';

it('Update existing endpoint metadata', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  const connected = createConnectedEventWithOneEndpoint(exampleEndpointId);
  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected }));

  // When
  const metadata = {
    newField: 'new field value',
  };

  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ endpointUpdated: createEndpointUpdatedPeerMetadata(exampleEndpointId, metadata) }),
  );

  // Then
  const endpoint = webRTCEndpoint.getRemoteEndpoints()[exampleEndpointId]!;
  expect(endpoint.metadata).toMatchObject(metadata);
});

it('Update existing endpoint produce event', () =>
  new Promise((done) => {
    // Given
    mockRTCPeerConnection();
    const webRTCEndpoint = new WebRTCEndpoint();

    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint(exampleEndpointId) }),
    );

    const metadata = {
      newField: 'new field value',
    };

    webRTCEndpoint.on('endpointUpdated', (endpoint) => {
      // Then
      expect(endpoint.metadata).toMatchObject(metadata);
      done('');
    });

    // When
    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({ endpointUpdated: createEndpointUpdatedPeerMetadata(exampleEndpointId, metadata) }),
    );
  }));

it('Update existing endpoint with undefined metadata', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  const connectedMediaEvent = createConnectedEventWithOneEndpoint(exampleEndpointId);
  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected: connectedMediaEvent }));

  // When
  const metadata = undefined;
  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ endpointUpdated: createEndpointUpdatedPeerMetadata(exampleEndpointId, metadata) }),
  );

  // Then
  const endpoint = webRTCEndpoint.getRemoteEndpoints()[exampleEndpointId]!;
  expect(endpoint.metadata).toBe(undefined);
});

it('Update endpoint that not exist', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected: createConnectedEvent() }));

  // When
  const metadata = {
    newField: 'new field value',
  };

  expect(() =>
    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({
        endpointUpdated: createEndpointUpdatedPeerMetadata(notExistingEndpointId, metadata),
      }),
    ),
  ).rejects.toThrow(`Endpoint ${notExistingEndpointId} not found`);
});

it('Parse metadata on endpoint update', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  const connectedMediaEvent = createConnectedEventWithOneEndpoint(exampleEndpointId);
  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected: connectedMediaEvent }));

  // When
  const metadata = {
    goodStuff: 'ye',
  };

  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ endpointUpdated: createEndpointUpdatedPeerMetadata(exampleEndpointId, metadata) }),
  );

  // Then
  const endpoints = webRTCEndpoint.getRemoteEndpoints();
  const addedEndpoint = Object.values(endpoints)[0]!;
  expect(addedEndpoint.metadata).toEqual({ goodStuff: 'ye' });
});
