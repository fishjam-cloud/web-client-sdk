import { mockRTCPeerConnection } from '../mocks';
import { WebRTCEndpoint } from '../../src';
import {
  createConnectedEvent,
  createConnectedEventWithOneEndpoint,
  createEndpointUpdatedPeerMetadata,
  endpointId,
  notExistingEndpointId,
} from '../fixtures';
import { expect, it } from 'vitest';

it('Update existing endpoint metadata', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  const connectedMediaEvent = createConnectedEventWithOneEndpoint(endpointId);
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(connectedMediaEvent));

  // When
  const metadata = {
    newField: 'new field value',
  };

  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createEndpointUpdatedPeerMetadata(endpointId, metadata)));

  // Then
  const endpoint = webRTCEndpoint.getRemoteEndpoints()[endpointId]!;
  expect(endpoint.metadata).toMatchObject(metadata);
});

it('Update existing endpoint produce event', () =>
  new Promise((done) => {
    // Given
    mockRTCPeerConnection();
    const webRTCEndpoint = new WebRTCEndpoint();

    const connectedMediaEvent = createConnectedEventWithOneEndpoint(endpointId);
    webRTCEndpoint.receiveMediaEvent(JSON.stringify(connectedMediaEvent));

    const metadata = {
      newField: 'new field value',
    };

    webRTCEndpoint.on('endpointUpdated', (endpoint) => {
      // Then
      expect(endpoint.metadata).toMatchObject(metadata);
      done('');
    });

    // When
    webRTCEndpoint.receiveMediaEvent(JSON.stringify(createEndpointUpdatedPeerMetadata(endpointId, metadata)));
  }));

it('Update existing endpoint with undefined metadata', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  const connectedMediaEvent = createConnectedEventWithOneEndpoint(endpointId);
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(connectedMediaEvent));

  // When
  const metadata = undefined;
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createEndpointUpdatedPeerMetadata(endpointId, metadata)));

  // Then
  const endpoint = webRTCEndpoint.getRemoteEndpoints()[endpointId]!;
  expect(endpoint.metadata).toBe(undefined);
});

it('Update endpoint that not exist', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createConnectedEvent()));

  // When
  const metadata = {
    newField: 'new field value',
  };

  expect(() =>
    webRTCEndpoint.receiveMediaEvent(
      JSON.stringify(createEndpointUpdatedPeerMetadata(notExistingEndpointId, metadata)),
    ),
  ).rejects.toThrow(`Endpoint ${notExistingEndpointId} not found`);
});

it('Parse metadata on endpoint update', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  const connectedMediaEvent = createConnectedEventWithOneEndpoint(endpointId);
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(connectedMediaEvent));

  // When
  const metadata = {
    goodStuff: 'ye',
  };

  webRTCEndpoint.receiveMediaEvent(JSON.stringify(createEndpointUpdatedPeerMetadata(endpointId, metadata)));

  // Then
  const endpoints = webRTCEndpoint.getRemoteEndpoints();
  const addedEndpoint = Object.values(endpoints)[0]!;
  expect(addedEndpoint.metadata).toEqual({ goodStuff: 'ye' });
});
