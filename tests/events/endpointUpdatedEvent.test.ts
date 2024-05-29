import { mockRTCPeerConnection } from '../mocks';
import { WebRTCEndpoint } from '../../src';
import {
  createConnectedEvent,
  createConnectedEventWithOneEndpoint,
  createEndpointUpdated,
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

  webRTCEndpoint.receiveMediaEvent(
    JSON.stringify(createEndpointUpdated(endpointId, metadata)),
  );

  // Then
  const endpoint = webRTCEndpoint.getRemoteEndpoints()[endpointId];
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
    webRTCEndpoint.receiveMediaEvent(
      JSON.stringify(createEndpointUpdated(endpointId, metadata)),
    );
  }));

it('Update existing endpoint with undefined metadata', () => {
  // Given
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  const connectedMediaEvent = createConnectedEventWithOneEndpoint(endpointId);
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(connectedMediaEvent));

  // When
  const metadata = undefined;
  webRTCEndpoint.receiveMediaEvent(
    JSON.stringify(createEndpointUpdated(endpointId, metadata)),
  );

  // Then
  const endpoint = webRTCEndpoint.getRemoteEndpoints()[endpointId];
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

  expect(() => {
    webRTCEndpoint.receiveMediaEvent(
      JSON.stringify(createEndpointUpdated(notExistingEndpointId, metadata)),
    );
    // todo change this error in production code
  }).toThrow("Cannot set properties of undefined (setting 'metadata')");
});

it('Parse metadata on endpoint update', () => {
  // Given
  type EndpointMetadata = { goodStuff: string };
  function endpointMetadataParser(data: any): EndpointMetadata {
    return { goodStuff: data.goodStuff };
  }
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint({ endpointMetadataParser });

  const connectedMediaEvent = createConnectedEventWithOneEndpoint(endpointId);
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(connectedMediaEvent));

  // When
  const metadata = {
    goodStuff: 'ye',
    extraFluff: 'nah',
  };

  webRTCEndpoint.receiveMediaEvent(
    JSON.stringify(createEndpointUpdated(endpointId, metadata)),
  );

  // Then
  const endpoints = webRTCEndpoint.getRemoteEndpoints();
  const addedEndpoint = Object.values(endpoints)[0];
  expect(addedEndpoint.metadata).toEqual({ goodStuff: 'ye' });
  expect(addedEndpoint.metadataParsingError).toBeUndefined();
  expect(addedEndpoint.rawMetadata).toEqual({
    goodStuff: 'ye',
    extraFluff: 'nah',
  });
});

it('Correctly handle incorrect metadata on endpoint update', () => {
  // Given
  type EndpointMetadata = { validMetadata: true };
  function endpointMetadataParser(data: any): EndpointMetadata {
    if (!data?.validMetadata) throw 'Invalid';
    return { validMetadata: true };
  }
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint({ endpointMetadataParser });

  const connectedMediaEvent = createConnectedEventWithOneEndpoint(endpointId);
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(connectedMediaEvent));

  // When
  const metadata = {
    trash: 'metadata',
  };

  webRTCEndpoint.receiveMediaEvent(
    JSON.stringify(createEndpointUpdated(endpointId, metadata)),
  );

  // Then
  const endpoints = webRTCEndpoint.getRemoteEndpoints();
  const addedEndpoint = Object.values(endpoints)[0];
  expect(addedEndpoint.metadata).toBeUndefined();
  expect(addedEndpoint.metadataParsingError).toBe('Invalid');
  expect(addedEndpoint.rawMetadata).toEqual({ trash: 'metadata' });
});
