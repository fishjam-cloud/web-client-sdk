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

it('Change existing track encoding', async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  const initialTrackEncoding = webRTCEndpoint.getRemoteTracks()[exampleTrackId]!.encoding;
  expect(initialTrackEncoding).toBe(undefined);

  // When
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({
      trackVariantSwitched: createEncodingSwitchedEvent(exampleEndpointId, exampleTrackId, Variant.VARIANT_MEDIUM),
    }),
  );

  // Then
  const finalTrackEncoding = webRTCEndpoint.getRemoteTracks()[exampleTrackId]!.encoding;
  expect(finalTrackEncoding).toBe(Variant.VARIANT_MEDIUM);
});

it('Changing track encoding when endpoint exist but track does not exist', async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  const initialTrackEncoding = webRTCEndpoint.getRemoteTracks()[exampleTrackId]!.encoding;
  expect(initialTrackEncoding).toBe(undefined);

  // When
  await expect(() =>
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

it('Changing track encoding when endpoint does not exist but track exist in other endpoint', async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  const initialTrackEncoding = webRTCEndpoint.getRemoteTracks()[exampleTrackId]!.encoding;
  expect(initialTrackEncoding).toBe(undefined);

  // When
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({
      trackVariantSwitched: createEncodingSwitchedEvent(notExistingEndpointId, exampleTrackId, Variant.VARIANT_MEDIUM),
    }),
  );

  // Then
  const finalTrackEncoding = webRTCEndpoint.getRemoteTracks()[exampleTrackId]!.encoding;
  expect(finalTrackEncoding).toBe(Variant.VARIANT_MEDIUM);
});

it('Change existing track encoding produces event', async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  const initialTrackEncoding = webRTCEndpoint.getRemoteTracks()[exampleTrackId]!.encoding;
  expect(initialTrackEncoding).toBe(undefined);

  const seen = new Promise<Variant>((resolve) => {
    webRTCEndpoint.getRemoteTracks()[exampleTrackId]!.on('encodingChanged', (context) => {
      if (context.encoding !== undefined) resolve(context.encoding);
    });
  });

  // When
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({
      trackVariantSwitched: createEncodingSwitchedEvent(exampleEndpointId, exampleTrackId, Variant.VARIANT_MEDIUM),
    }),
  );

  // Then
  expect(await seen).toBe(Variant.VARIANT_MEDIUM);
});
