import { WebRTCEndpoint } from '../../src';
import { createConnectedEventWithOneEndpoint, mockTrack } from '../fixtures';
import { mockMediaStream, mockRTCPeerConnection } from '../mocks';
import { deserializePeerMediaEvent, serializeServerMediaEvent } from '../../src/mediaEvent';
import { expect, it } from 'vitest';

it('Adding track invokes renegotiation', () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();
    mockMediaStream();

    const mediaEvent = serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint() });
    webRTCEndpoint.receiveMediaEvent(mediaEvent);

    webRTCEndpoint.on('sendMediaEvent', (mediaEvent) => {
      // Then
      const event = deserializePeerMediaEvent(mediaEvent);
      expect(event.renegotiateTracks).toBeTruthy();
      done('');

      // now it's time to create offer and answer
      // webRTCEndpoint.receiveMediaEvent(JSON.stringify(createOfferData()))
      // webRTCEndpoint.receiveMediaEvent(JSON.stringify(createAnswerData("9bf0cc85-c795-43b2-baf1-2c974cd770b9:1b6d99d1-3630-4e01-b386-15cbbfe5a41f")))
    });

    // When
    webRTCEndpoint.addTrack(mockTrack);
  }));

it('Adding track updates internal state', () => {
  // Given
  mockRTCPeerConnection();
  mockMediaStream();

  const webRTCEndpoint = new WebRTCEndpoint();

  const mediaEvent = serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint() });

  webRTCEndpoint.receiveMediaEvent(mediaEvent);

  // When
  webRTCEndpoint.addTrack(mockTrack);

  // Then
  const localTrackIdToTrack = webRTCEndpoint['local'].getTrackIdToTrack();
  expect(localTrackIdToTrack.size).toBe(1);

  const localEndpoint = webRTCEndpoint['local'].getEndpoint();
  expect(localEndpoint.tracks.size).toBe(1);
});

it('Adding track before being accepted by the server throws error', async () => {
  // Given
  mockRTCPeerConnection();
  mockMediaStream();

  const webRTCEndpoint = new WebRTCEndpoint();

  // When
  await expect(() => webRTCEndpoint.addTrack(mockTrack)).rejects.toThrow(
    'Cannot add tracks before being accepted by the server',
  );
});
