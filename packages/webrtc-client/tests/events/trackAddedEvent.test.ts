import { expect, it } from 'vitest';

import { WebRTCEndpoint } from '../../src';
import { deserializePeerMediaEvent, serializeServerMediaEvent } from '../../src/mediaEvent';
import {
  createAddTrackMediaEvent,
  createAnswerData,
  createConnectedEventWithOneEndpoint,
  createCustomOfferDataEventWithOneVideoTrack,
  exampleTrackId,
} from '../fixtures';
import { mockRTCPeerConnection } from '../mocks';

it('Connect to room with one endpoint then addTrack produce event', async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  const eventWithOneEndpoint = createConnectedEventWithOneEndpoint();
  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected: eventWithOneEndpoint }));

  const [otherEndpointId] = Object.entries(eventWithOneEndpoint.endpointIdToEndpoint).find(
    ([id]) => id !== eventWithOneEndpoint.endpointId,
  )!;

  const tracksAdded = createAddTrackMediaEvent(otherEndpointId, exampleTrackId);

  const seen = new Promise<void>((resolve) => {
    webRTCEndpoint.on('trackAdded', (ctx) => {
      expect(ctx.trackId).toBe(exampleTrackId);
      expect(ctx.endpoint.id).toBe(tracksAdded.endpointId);
      expect(ctx.simulcastConfig?.enabled).toBe(tracksAdded.trackIdToTrack[exampleTrackId]!.simulcastConfig?.enabled);
      resolve();
    });
  });

  // When
  await webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ tracksAdded }));
  await seen;

  // Then
  const remoteTracks: Record<string, any> = webRTCEndpoint.getRemoteTracks();
  expect(Object.values(remoteTracks).length).toBe(1);
});

it('Correctly parses track metadata', async () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  const connected = createConnectedEventWithOneEndpoint();

  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected }));

  const otherEndpointId = Object.keys(connected.endpointIdToEndpoint).find((id) => id !== connected.endpointId)!;

  const tracksAdded = createAddTrackMediaEvent(otherEndpointId, exampleTrackId, {
    peer: { goodStuff: 'ye', extraFluff: 'nah' },
  });

  const seen = new Promise<unknown>((resolve) => {
    webRTCEndpoint.on('trackAdded', (ctx) => resolve(ctx.metadata));
  });

  // When
  await webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ tracksAdded }));

  // Then
  expect(await seen).toEqual({ peer: { goodStuff: 'ye', extraFluff: 'nah' } });
});

it('tracksAdded -> handle offerData with one video track from server', async () => {
  // Given
  const { addTransceiverCallback } = mockRTCPeerConnection();

  const webRTCEndpoint = new WebRTCEndpoint();

  const connected = createConnectedEventWithOneEndpoint();

  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected }));

  const otherEndpointId = Object.keys(connected.endpointIdToEndpoint).find((id) => id !== connected.endpointId)!;

  const trackAddedEvent = createAddTrackMediaEvent(otherEndpointId, exampleTrackId);

  await webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ tracksAdded: trackAddedEvent }));

  const offerData = createCustomOfferDataEventWithOneVideoTrack();

  const offerSent = new Promise<void>((resolve) => {
    webRTCEndpoint.on('sendMediaEvent', (mediaEvent) => {
      const event = deserializePeerMediaEvent(mediaEvent);
      if (event.sdpOffer) resolve();
    });
  });

  // When
  await webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ offerData }));
  await offerSent;

  // Then
  expect(addTransceiverCallback.mock.calls).toHaveLength(1);
  expect(addTransceiverCallback.mock.calls[0][0]).toBe('video');

  const transceivers = webRTCEndpoint['connectionManager']!.getConnection()!.getTransceivers();

  expect(transceivers.length).toBe(1);
  expect(transceivers[0]!.direction).toBe('recvonly');
});

it('tracksAdded -> offerData with one track -> handle sdpAnswer data with one video track from server', async () => {
  // Given
  mockRTCPeerConnection();

  const webRTCEndpoint = new WebRTCEndpoint();

  const connected = createConnectedEventWithOneEndpoint();

  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected }));

  const otherEndpointId = Object.keys(connected.endpointIdToEndpoint).find((id) => id !== connected.endpointId)!;

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ tracksAdded: createAddTrackMediaEvent(otherEndpointId, exampleTrackId) }),
  );
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ offerData: createCustomOfferDataEventWithOneVideoTrack() }),
  );

  // When
  const sdpAnswer = createAnswerData(exampleTrackId);

  await webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ sdpAnswer }));

  // Then
  const midToTrackId = webRTCEndpoint['local']['getMidToTrackId']();

  // midToTrackId?.size should be undefined because the local peer doesn't offer anything
  expect(midToTrackId?.size).toBe(undefined);
});
