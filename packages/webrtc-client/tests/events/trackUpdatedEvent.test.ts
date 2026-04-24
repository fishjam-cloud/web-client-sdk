import { expect, it } from 'vitest';

import { WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
import { createTrackUpdatedEvent, exampleEndpointId, exampleTrackId, notExistingEndpointId } from '../fixtures';
import { setupRoom } from '../utils';

it(`Updating existing track emits events`, async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  const metadata = {
    name: 'New name',
  };

  const seen = new Promise<unknown>((resolve) => {
    webRTCEndpoint.on('trackUpdated', (context) => resolve(context.metadata));
  });

  // When
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ trackUpdated: createTrackUpdatedEvent(exampleTrackId, exampleEndpointId, metadata) }),
  );

  // Then
  expect(await seen).toEqual(metadata);
});

it(`Updating existing track changes track metadata`, async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  const metadata = {
    name: 'New name',
  };

  // When
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ trackUpdated: createTrackUpdatedEvent(exampleTrackId, exampleEndpointId, metadata) }),
  );

  // Then
  const track = webRTCEndpoint.getRemoteTracks()[exampleTrackId];
  expect(track!.metadata).toEqual(metadata);
});

it('Correctly parses track metadata', async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  const metadata = {
    goodStuff: 'ye',
  };

  // When
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ trackUpdated: createTrackUpdatedEvent(exampleTrackId, exampleEndpointId, metadata) }),
  );

  // Then
  const track = webRTCEndpoint.getRemoteTracks()[exampleTrackId]!;
  expect(track.metadata).toEqual({ goodStuff: 'ye' });
});

it.todo(`Webrtc endpoint skips updating local endpoint metadata`, () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  const metadata = {
    name: 'New name',
  };

  // When
  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ trackUpdated: createTrackUpdatedEvent(exampleTrackId, exampleEndpointId, metadata) }),
  );

  // Then
  // todo How should empty metadata be handled?
  //  - empty object {}
  //  - null
  //  - undefined
  // expect(track.metadata).toBe(value.data.otherEndpoints[0].metadata as any)
  // TODO: write the rest of the test once we expose webrtc.getLocalEndpoints() function
});

it(`Updating track with invalid endpoint id throws`, async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  const metadata = {
    name: 'New name',
  };

  // Then
  await expect(() =>
    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({
        trackUpdated: createTrackUpdatedEvent(exampleTrackId, notExistingEndpointId, metadata),
      }),
    ),
  ).rejects.toThrow(`Endpoint ${notExistingEndpointId} not found`);
});
