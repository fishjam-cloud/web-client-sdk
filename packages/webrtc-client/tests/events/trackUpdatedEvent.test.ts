import { WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
import { createTrackUpdatedEvent, endpointId, notExistingEndpointId, trackId } from '../fixtures';
import { setupRoom } from '../utils';
import { expect, it } from 'vitest';

it(`Updating existing track emits events`, () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();

    setupRoom(webRTCEndpoint, endpointId, trackId);

    webRTCEndpoint.on('trackUpdated', (context) => {
      // Then
      expect(context.metadata).toEqual(metadata);
      done('');
    });

    const metadata = {
      name: 'New name',
    };

    // When
    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({ trackUpdated: createTrackUpdatedEvent(trackId, endpointId, metadata) }),
    );
  }));

it(`Updating existing track changes track metadata`, () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, endpointId, trackId);

  const metadata = {
    name: 'New name',
  };

  // When
  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ trackUpdated: createTrackUpdatedEvent(trackId, endpointId, metadata) }),
  );

  // Then
  const track = webRTCEndpoint.getRemoteTracks()[trackId];
  expect(track!.metadata).toEqual(metadata);
});

it('Correctly parses track metadata', () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, endpointId, trackId);

  const metadata = {
    goodStuff: 'ye',
  };

  // When
  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ trackUpdated: createTrackUpdatedEvent(trackId, endpointId, metadata) }),
  );

  // Then
  const track = webRTCEndpoint.getRemoteTracks()[trackId]!;
  expect(track.metadata).toEqual({ goodStuff: 'ye' });
});

it.todo(`Webrtc endpoint skips updating local endpoint metadata`, () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, endpointId, trackId);

  const metadata = {
    name: 'New name',
  };

  // When
  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ trackUpdated: createTrackUpdatedEvent(trackId, endpointId, metadata) }),
  );

  // Then
  // todo How should empty metadata be handled?
  //  - empty object {}
  //  - null
  //  - undefined
  // expect(track.metadata).toBe(value.data.otherEndpoints[0].metadata as any)
  // TODO: write the rest of the test once we expose webrtc.getLocalEndpoints() function
});

it(`Updating track with invalid endpoint id throws error`, () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, endpointId, trackId);

  const metadata = {
    name: 'New name',
  };

  // When
  expect(() =>
    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({ trackUpdated: createTrackUpdatedEvent(trackId, notExistingEndpointId, metadata) }),
    ),
  )
    // Then
    .rejects.toThrow(`Endpoint ${notExistingEndpointId} not found`);
});
