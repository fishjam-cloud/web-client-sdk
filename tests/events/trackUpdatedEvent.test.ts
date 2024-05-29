import { WebRTCEndpoint } from '../../src';
import {
  createTrackUpdatedEvent,
  endpointId,
  notExistingEndpointId,
  trackId,
} from '../fixtures';
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
    const trackUpdated = createTrackUpdatedEvent(trackId, endpointId, metadata);
    webRTCEndpoint.receiveMediaEvent(JSON.stringify(trackUpdated));
  }));

it(`Updating existing track changes track metadata`, () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, endpointId, trackId);

  const metadata = {
    name: 'New name',
  };

  // When
  const trackUpdated = createTrackUpdatedEvent(trackId, endpointId, metadata);
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(trackUpdated));

  // Then
  const track = webRTCEndpoint.getRemoteTracks()[trackId];
  expect(track.metadata).toEqual(metadata);
});

it('Correctly parses track metadata', () => {
  // Given
  type TrackMetadata = { goodStuff: string };
  function trackMetadataParser(data: any): TrackMetadata {
    return { goodStuff: data.goodStuff };
  }
  const webRTCEndpoint = new WebRTCEndpoint({ trackMetadataParser });

  setupRoom(webRTCEndpoint, endpointId, trackId);

  const metadata = {
    goodStuff: 'ye',
    extraFluff: 'nah',
  };

  // When
  const trackUpdated = createTrackUpdatedEvent(trackId, endpointId, metadata);
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(trackUpdated));

  // Then
  const track = webRTCEndpoint.getRemoteTracks()[trackId];
  expect(track.metadata).toEqual({ goodStuff: 'ye' });
  expect(track.rawMetadata).toEqual({ goodStuff: 'ye', extraFluff: 'nah' });
  expect(track.metadataParsingError).toBeUndefined();
});

it('Correctly handles incorrect metadata', () => {
  // Given
  type TrackMetadata = { validMetadata: true };
  function trackMetadataParser(data: any): TrackMetadata {
    if (!data.validMetadata) throw 'Invalid';
    return { validMetadata: true };
  }
  const webRTCEndpoint = new WebRTCEndpoint({ trackMetadataParser });

  setupRoom(webRTCEndpoint, endpointId, trackId);

  const metadata = {
    validMetadata: false,
  };

  // When
  const trackUpdated = createTrackUpdatedEvent(trackId, endpointId, metadata);
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(trackUpdated));

  // Then
  const track = webRTCEndpoint.getRemoteTracks()[trackId];
  expect(track.metadata).toBeUndefined();
  expect(track.rawMetadata).toEqual({ validMetadata: false });
  expect(track.metadataParsingError).toBe('Invalid');
});

it.todo(`Webrtc endpoint skips updating local endpoint metadata`, () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, endpointId, trackId);

  const metadata = {
    name: 'New name',
  };

  // When
  const trackUpdated = createTrackUpdatedEvent(trackId, endpointId, metadata);
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(trackUpdated));

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

  expect(() => {
    // When
    const trackUpdated = createTrackUpdatedEvent(
      trackId,
      notExistingEndpointId,
      metadata,
    );
    webRTCEndpoint.receiveMediaEvent(JSON.stringify(trackUpdated));

    // Then
  }).toThrow(`Endpoint with id: ${notExistingEndpointId} doesn't exist`);
});
