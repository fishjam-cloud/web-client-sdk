import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
import { expect, it } from 'vitest';

import { Variant, WebRTCEndpoint } from '../../src';
import { TrackContextImpl } from '../../src/internal';
import { deserializePeerMediaEvent, serializeServerMediaEvent } from '../../src/mediaEvent';
import { createTransceiverConfig } from '../../src/tracks/transceivers';
import { createConnectedEventWithOneEndpoint, mockTrack } from '../fixtures';
import { mockMediaStream, mockRTCPeerConnection } from '../mocks';

it('Adding track invokes renegotiation', async () => {
  const webRTCEndpoint = new WebRTCEndpoint();
  mockMediaStream();

  const serializedEvent = serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint() });
  await webRTCEndpoint.receiveMediaEvent(serializedEvent);

  const renegotiationSeen = new Promise<void>((resolve) => {
    webRTCEndpoint.on('sendMediaEvent', (mediaEvent) => {
      const event = deserializePeerMediaEvent(mediaEvent);
      if (event.renegotiateTracks) resolve();
    });
  });

  webRTCEndpoint.addTrack(mockTrack);
  await renegotiationSeen;
});

it('Adding track updates internal state', async () => {
  mockRTCPeerConnection();
  mockMediaStream();

  const webRTCEndpoint = new WebRTCEndpoint();

  const serializedEvent = serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint() });

  await webRTCEndpoint.receiveMediaEvent(serializedEvent);

  webRTCEndpoint.addTrack(mockTrack);

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
    {
      enabled: true,
      enabledVariants: [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH],
      disabledVariants: [],
    },
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
