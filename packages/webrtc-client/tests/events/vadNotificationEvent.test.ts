import { MediaEvent_VadNotification_Status } from '@fishjam-cloud/protobufs/server';
import { expect, it } from 'vitest';

import { WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
import { createCustomVadNotificationEvent, exampleEndpointId, exampleTrackId } from '../fixtures';
import { setupRoom } from '../utils';

it(`Changing VAD notification to "speech" on existing track id`, async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  // When
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({
      vadNotification: createCustomVadNotificationEvent(
        exampleTrackId,
        MediaEvent_VadNotification_Status.STATUS_SPEECH,
      ),
    }),
  );

  // Then
  const track = webRTCEndpoint.getRemoteTracks()[exampleTrackId]!;
  expect(track.vadStatus).toBe('speech');
});

it(`Changing VAD notification to "silence" on existing track id`, async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  // When
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({
      vadNotification: createCustomVadNotificationEvent(
        exampleTrackId,
        MediaEvent_VadNotification_Status.STATUS_SILENCE,
      ),
    }),
  );

  // Then
  const track = webRTCEndpoint.getRemoteTracks()[exampleTrackId]!;
  expect(track.vadStatus).toBe('silence');
});

it(`Changing VAD notification emits event`, async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  await setupRoom(webRTCEndpoint, exampleEndpointId, exampleTrackId);

  const seen = new Promise<string | undefined>((resolve) => {
    webRTCEndpoint.getRemoteTracks()[exampleTrackId]!.on('voiceActivityChanged', (context) => {
      resolve(context.vadStatus ?? undefined);
    });
  });

  // When
  const vadNotification = createCustomVadNotificationEvent(
    exampleTrackId,
    MediaEvent_VadNotification_Status.STATUS_SPEECH,
  );
  await webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ vadNotification }));

  // Then
  expect(await seen).toBe('speech');
});
