import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
import { expect, it } from 'vitest';

import { WebRTCEndpoint } from '../../src';
import { TrackContextImpl } from '../../src/internal';
import { deserializePeerMediaEvent, serializeServerMediaEvent } from '../../src/mediaEvent';
import { createTransceiverConfig } from '../../src/tracks/transceivers';
import { createConnectedEventWithOneEndpoint, mockTrack } from '../fixtures';
import { mockMediaStream, mockRTCPeerConnection } from '../mocks';

it('Adding track invokes renegotiation', () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();
    mockMediaStream();

    const serializedEvent = serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint() });
    webRTCEndpoint.receiveMediaEvent(serializedEvent);

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

  const serializedEvent = serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint() });

  webRTCEndpoint.receiveMediaEvent(serializedEvent);

  // When
  webRTCEndpoint.addTrack(mockTrack);

  // Then
  const localTrackIdToTrack = webRTCEndpoint['local'].getTrackIdToTrack();
  expect(localTrackIdToTrack.size).toBe(1);

  const localEndpoint = webRTCEndpoint['local'].getEndpoint();
  expect(localEndpoint.tracks.size).toBe(1);
});

it('Simulcast transceiver config includes the stream', () => {
  const stream = { id: 'test-stream-id' } as MediaStream;
  const videoTrack = new FakeMediaStreamTrack({ kind: 'video' });

  const trackContext = new TrackContextImpl(
    { id: 'endpoint-1', type: 'webrtc', metadata: undefined, tracks: new Map() },
    'track-1',
    undefined,
    { enabled: true, enabledVariants: [1, 2, 3], disabledVariants: [] },
  );
  trackContext.track = videoTrack;
  trackContext.stream = stream;
  trackContext.maxBandwidth = 0;

  const config = createTransceiverConfig(trackContext);

  expect(config.streams).toEqual([stream]);
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
