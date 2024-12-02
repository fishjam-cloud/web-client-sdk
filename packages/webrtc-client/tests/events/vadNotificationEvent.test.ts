import { MediaEvent_VadNotification_Status } from '@fishjam-cloud/protobufs/server';
import { WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
import { createCustomVadNotificationEvent, endpointId, trackId } from '../fixtures';
import { setupRoom } from '../utils';
import { expect, it } from 'vitest';

it(`Changing VAD notification to "speech" on existing track id`, () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, endpointId, trackId);

  // When
  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({
      vadNotification: createCustomVadNotificationEvent(trackId, MediaEvent_VadNotification_Status.STATUS_SPEECH),
    }),
  );

  // Then
  const track = webRTCEndpoint.getRemoteTracks()[trackId]!;
  expect(track.vadStatus).toBe('speech');
});

it(`Changing VAD notification to "silence" on existing track id`, () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  setupRoom(webRTCEndpoint, endpointId, trackId);

  // When
  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({
      vadNotification: createCustomVadNotificationEvent(trackId, MediaEvent_VadNotification_Status.STATUS_SILENCE),
    }),
  );

  // Then
  const track = webRTCEndpoint.getRemoteTracks()[trackId]!;
  expect(track.vadStatus).toBe('silence');
});

it(`Changing VAD notification emits event`, () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();

    setupRoom(webRTCEndpoint, endpointId, trackId);

    webRTCEndpoint.getRemoteTracks()[trackId]!.on('voiceActivityChanged', (context) => {
      expect(context.vadStatus).toBe('speech');
      done('');
    });

    // When
    const vadNotification = createCustomVadNotificationEvent(trackId, MediaEvent_VadNotification_Status.STATUS_SPEECH);
    webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ vadNotification }));
  }));
