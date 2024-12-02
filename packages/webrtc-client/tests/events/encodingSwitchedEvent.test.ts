import { Variant, WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
import {
  createEncodingSwitchedEvent,
  endpointId,
  notExistingEndpointId,
  notExistingTrackId,
  trackId,
} from '../fixtures';
import { setupRoom } from '../utils';
import { expect, it } from 'vitest';

it('Change existing track encoding', () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, endpointId, trackId);

  const initialTrackEncoding = webRTCEndpoint.getRemoteTracks()[trackId]!.encoding;
  expect(initialTrackEncoding).toBe(undefined);

  // When
  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({
      trackVariantSwitched: createEncodingSwitchedEvent(endpointId, trackId, Variant.VARIANT_MEDIUM),
    }),
  );

  // Then
  const finalTrackEncoding = webRTCEndpoint.getRemoteTracks()[trackId]!.encoding;
  expect(finalTrackEncoding).toBe(Variant.VARIANT_MEDIUM);
});

it('Changing track encoding when endpoint exist but track does not exist', () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, endpointId, trackId);

  const initialTrackEncoding = webRTCEndpoint.getRemoteTracks()[trackId]!.encoding;
  expect(initialTrackEncoding).toBe(undefined);

  // When
  expect(() =>
    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({
        trackVariantSwitched: createEncodingSwitchedEvent(endpointId, notExistingTrackId, Variant.VARIANT_MEDIUM),
      }),
    ),
  ).rejects.toThrow(`Track ${notExistingTrackId} not found`);
});

it('Changing track encoding when endpoint does not exist but track exist in other endpoint', () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, endpointId, trackId);

  const initialTrackEncoding = webRTCEndpoint.getRemoteTracks()[trackId]!.encoding;
  expect(initialTrackEncoding).toBe(undefined);

  // When
  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({
      trackVariantSwitched: createEncodingSwitchedEvent(notExistingEndpointId, trackId, Variant.VARIANT_MEDIUM),
    }),
  );

  // Then
  const finalTrackEncoding = webRTCEndpoint.getRemoteTracks()[trackId]!.encoding;
  expect(finalTrackEncoding).toBe(Variant.VARIANT_MEDIUM);
});

it('Change existing track encoding produces event', () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();

    setupRoom(webRTCEndpoint, endpointId, trackId);

    const initialTrackEncoding = webRTCEndpoint.getRemoteTracks()[trackId]!.encoding;
    expect(initialTrackEncoding).toBe(undefined);

    webRTCEndpoint.getRemoteTracks()[trackId]!.on('encodingChanged', (context) => {
      // Then
      expect(context.encoding).toBe(Variant.VARIANT_MEDIUM);
      done('');
    });

    // When
    webRTCEndpoint.receiveMediaEvent(
      serializeServerMediaEvent({
        trackVariantSwitched: createEncodingSwitchedEvent(endpointId, trackId, Variant.VARIANT_MEDIUM),
      }),
    );
  }));
