import { expect, it } from 'vitest';

import { WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
import {
  createConnectedEvent,
  createConnectedEventWithOneEndpoint,
  createEndpointUpdatedPeerMetadata,
  exampleEndpointId,
  notExistingEndpointId,
} from '../fixtures';
import { mockRTCPeerConnection } from '../mocks';

it('Update existing endpoint metadata', async () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  const connected = createConnectedEventWithOneEndpoint(exampleEndpointId);
  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected }));

  // When
  const metadata = {
    newField: 'new field value',
  };

  await webRTCEndpoint.receiveMediaEvent(
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

it('Update existing endpoint with undefined metadata', async () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  const connectedMediaEvent = createConnectedEventWithOneEndpoint(exampleEndpointId);
  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected: connectedMediaEvent }));

  // When
  const metadata = undefined;
  await webRTCEndpoint.receiveMediaEvent(
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

  // Then
  expect(() =>
    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({
        endpointUpdated: createEndpointUpdatedPeerMetadata(notExistingEndpointId, metadata),
      }),
    ),
  ).rejects.toThrow(`Endpoint ${notExistingEndpointId} not found`);
});

it('Parse metadata on endpoint update', async () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  const connectedMediaEvent = createConnectedEventWithOneEndpoint(exampleEndpointId);
  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected: connectedMediaEvent }));

  // When
  const metadata = {
    goodStuff: 'ye',
  };

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ endpointUpdated: createEndpointUpdatedPeerMetadata(exampleEndpointId, metadata) }),
  );

  // Then
  const endpoints = webRTCEndpoint.getRemoteEndpoints();
  const addedEndpoint = Object.values(endpoints)[0]!;
  expect(addedEndpoint.metadata).toEqual({ goodStuff: 'ye' });
});
