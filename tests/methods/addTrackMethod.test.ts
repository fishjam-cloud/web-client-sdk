import { WebRTCEndpoint } from '../../src';
import { createConnectedEventWithOneEndpoint, mockTrack } from '../fixtures';
import { mockMediaStream, mockRTCPeerConnection } from '../mocks';
import { deserializeMediaEvent } from '../../src/webrtc/mediaEvent';
import { expect, it } from 'vitest';

it('Adding track invokes renegotiation', () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();
    mockMediaStream();

    webRTCEndpoint.receiveMediaEvent(
      JSON.stringify(createConnectedEventWithOneEndpoint()),
    );

    webRTCEndpoint.on('sendMediaEvent', (mediaEvent) => {
      // Then
      expect(mediaEvent).toContain('renegotiateTracks');
      const event = deserializeMediaEvent(mediaEvent);
      expect(event.type).toBe('custom');
      expect(event.data.type).toBe('renegotiateTracks');
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

  webRTCEndpoint.receiveMediaEvent(
    JSON.stringify(createConnectedEventWithOneEndpoint()),
  );

  // When
  webRTCEndpoint.addTrack(mockTrack);

  // Then
  const localTrackIdToTrack = webRTCEndpoint['localTrackIdToTrack'];
  expect(localTrackIdToTrack.size).toBe(1);

  const localEndpoint = webRTCEndpoint['localEndpoint'];
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

it('Adding track with invalid metadata throws error', async () => {
  // Given
  type TrackMetadata = { validMetadata: true };

  function trackMetadataParser(data: any): TrackMetadata {
    if (!data?.trackMetadataParser) throw 'Invalid';
    return { validMetadata: true };
  }

  mockRTCPeerConnection();
  mockMediaStream();

  const webRTCEndpoint = new WebRTCEndpoint({ trackMetadataParser });

  // When
  await expect(() =>
    webRTCEndpoint.addTrack(mockTrack, {
      validMetadata: false,
    } as unknown as TrackMetadata),
  ).rejects.toThrow('Invalid');
});
