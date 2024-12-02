import { WebRTCEndpoint } from '../../src';
import { deserializePeerMediaEvent } from '../../src/mediaEvent';
import { expect, it } from 'vitest';

it('Method connect sends mediaEvent to backend', () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();

    const peerMetadata = {};

    webRTCEndpoint.on('sendMediaEvent', (mediaEvent) => {
      // Then
      const event = deserializePeerMediaEvent(mediaEvent);
      expect(event.connect).toBeTruthy();
      done('');
    });

    // When
    webRTCEndpoint.connect(peerMetadata);
  }));

it("Method 'connect' sends metadata in event", () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();

    const peerMetadata = { exampleField: 'exampleValue' };

    webRTCEndpoint.on('sendMediaEvent', (mediaEvent) => {
      // Then
      const event = deserializePeerMediaEvent(mediaEvent);
      const metadataJson = event.connect?.metadataJson;
      expect(metadataJson).toBeDefined();
      expect(JSON.parse(metadataJson!)).toMatchObject(peerMetadata);
      done('');
    });

    // When
    webRTCEndpoint.connect(peerMetadata);
  }));

it("Method 'connect' sets metadata in local field", () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  const peerMetadata = { exampleField: 'exampleValue' };

  // When
  webRTCEndpoint.connect(peerMetadata);

  // Then
  expect(webRTCEndpoint['local'].getEndpoint().metadata).toMatchObject(peerMetadata);
});
