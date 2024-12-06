import { expect, it } from 'vitest';

import { Variant, WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
import {
  createEncodingSwitchedEvent,
  exampleEndpointId,
  exampleTrackId,
  notExistingEndpointId,
  notExistingTrackId,
} from '../fixtures';
import { setupRoom } from '../utils';

it('Change existing track encoding', () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  const initialTrackEncoding = webRTCEndpoint.getRemoteTracks()[exampleTrackId]!.encoding;
  expect(initialTrackEncoding).toBe(undefined);

  // When
  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({
      trackVariantSwitched: createEncodingSwitchedEvent(exampleEndpointId, exampleTrackId, Variant.VARIANT_MEDIUM),
    }),
  );

  // Then
  const finalTrackEncoding = webRTCEndpoint.getRemoteTracks()[exampleTrackId]!.encoding;
  expect(finalTrackEncoding).toBe(Variant.VARIANT_MEDIUM);
});

it('Changing track encoding when endpoint exist but track does not exist', () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  const initialTrackEncoding = webRTCEndpoint.getRemoteTracks()[exampleTrackId]!.encoding;
  expect(initialTrackEncoding).toBe(undefined);

  // When
  expect(() =>
    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({
        trackVariantSwitched: createEncodingSwitchedEvent(
          exampleEndpointId,
          notExistingTrackId,
          Variant.VARIANT_MEDIUM,
        ),
      }),
    ),
  ).rejects.toThrow(`Track ${notExistingTrackId} not found`);
});

it('Changing track encoding when endpoint does not exist but track exist in other endpoint', () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  const initialTrackEncoding = webRTCEndpoint.getRemoteTracks()[exampleTrackId]!.encoding;
  expect(initialTrackEncoding).toBe(undefined);

  // When
  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({
      trackVariantSwitched: createEncodingSwitchedEvent(notExistingEndpointId, exampleTrackId, Variant.VARIANT_MEDIUM),
    }),
  );

  // Then
  const finalTrackEncoding = webRTCEndpoint.getRemoteTracks()[exampleTrackId]!.encoding;
  expect(finalTrackEncoding).toBe(Variant.VARIANT_MEDIUM);
});

it('Change existing track encoding produces event', () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();

    setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

    const initialTrackEncoding = webRTCEndpoint.getRemoteTracks()[exampleTrackId]!.encoding;
    expect(initialTrackEncoding).toBe(undefined);

    webRTCEndpoint.getRemoteTracks()[exampleTrackId]!.on('encodingChanged', (context) => {
      // Then
      expect(context.encoding).toBe(Variant.VARIANT_MEDIUM);
      done('');
    });

    // When
    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({
        trackVariantSwitched: createEncodingSwitchedEvent(exampleEndpointId, exampleTrackId, Variant.VARIANT_MEDIUM),
      }),
    );
  }));
