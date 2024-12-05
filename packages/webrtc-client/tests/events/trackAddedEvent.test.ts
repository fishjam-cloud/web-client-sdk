import { expect, it } from 'vitest';

import { WebRTCEndpoint } from '../../src';
import { deserializePeerMediaEvent, serializeServerMediaEvent } from '../../src/mediaEvent';
import {
  createAddTrackMediaEvent,
  createAnswerData,
  createConnectedEventWithOneEndpoint,
  createCustomOfferDataEventWithOneVideoTrack,
  trackId,
} from '../fixtures';
import { mockRTCPeerConnection } from '../mocks';

it('Connect to room with one endpoint then addTrack produce event', () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();

    const eventWithOneEndpoint = createConnectedEventWithOneEndpoint();
    webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected: eventWithOneEndpoint }));

    const [otherEndpointId] = Object.entries(eventWithOneEndpoint.endpointIdToEndpoint).find(
      ([id]) => id !== eventWithOneEndpoint.endpointId,
    )!;

    const tracksAdded = createAddTrackMediaEvent(otherEndpointId, trackId);

    webRTCEndpoint.on('trackAdded', (ctx) => {
      expect(ctx.trackId).toBe(trackId);
      expect(ctx.endpoint.id).toBe(tracksAdded.endpointId);
      expect(ctx.simulcastConfig?.enabled).toBe(tracksAdded.trackIdToTrack[trackId]!.simulcastConfig?.enabled);
      done('');
    });

    // When
    webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ tracksAdded }));

    // Then
    const remoteTracks: Record<string, any> = webRTCEndpoint.getRemoteTracks();
    expect(Object.values(remoteTracks).length).toBe(1);
  }));

it('Correctly parses track metadata', () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();

    const connected = createConnectedEventWithOneEndpoint();

    webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected }));

    const otherEndpointId = Object.keys(connected.endpointIdToEndpoint).find((id) => id !== connected.endpointId)!;

    const tracksAdded = createAddTrackMediaEvent(otherEndpointId, trackId, {
      peer: { goodStuff: 'ye', extraFluff: 'nah' },
    });

    webRTCEndpoint.on('trackAdded', (ctx) => {
      // Then
      expect(ctx.metadata).toEqual({ peer: { goodStuff: 'ye', extraFluff: 'nah' } });
      done('');
    });

    // When
    webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ tracksAdded }));
  }));

it('tracksAdded -> handle offerData with one video track from server', () =>
  new Promise((done) => {
    // Given
    const { addTransceiverCallback } = mockRTCPeerConnection();

    const webRTCEndpoint = new WebRTCEndpoint();

    const connected = createConnectedEventWithOneEndpoint();

    webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected }));

    const otherEndpointId = Object.keys(connected.endpointIdToEndpoint).find((id) => id !== connected.endpointId)!;

    const trackAddedEvent = createAddTrackMediaEvent(otherEndpointId, trackId);

    webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ tracksAdded: trackAddedEvent }));

    const offerData = createCustomOfferDataEventWithOneVideoTrack();

    webRTCEndpoint.on('sendMediaEvent', (mediaEvent) => {
      const event = deserializePeerMediaEvent(mediaEvent);
      expect(event.sdpOffer).toBeDefined();
      done('');
    });

    // When
    webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ offerData }));

    // Then

    // todo
    //  if there is no connection: Setup callbacks else restartIce
    expect(addTransceiverCallback.mock.calls).toHaveLength(1);
    expect(addTransceiverCallback.mock.calls[0][0]).toBe('video');

    const transceivers = webRTCEndpoint['connectionManager']!.getConnection()!.getTransceivers();

    expect(transceivers.length).toBe(1);
    expect(transceivers[0]!.direction).toBe('recvonly');
  }));

it('tracksAdded -> offerData with one track -> handle sdpAnswer data with one video track from server', () => {
  // Given
  mockRTCPeerConnection();

  const webRTCEndpoint = new WebRTCEndpoint();

  const connected = createConnectedEventWithOneEndpoint();

  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected }));

  const otherEndpointId = Object.keys(connected.endpointIdToEndpoint).find((id) => id !== connected.endpointId)!;

  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ tracksAdded: createAddTrackMediaEvent(otherEndpointId, trackId) }),
  );
  webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ offerData: createCustomOfferDataEventWithOneVideoTrack() }),
  );

  // When
  const sdpAnswer = createAnswerData(trackId);

  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ sdpAnswer }));

  // Then
  const midToTrackId = webRTCEndpoint['local']['getMidToTrackId']();

  // midToTrackId?.size should be undefined because the local peer doesn't offer anything
  expect(midToTrackId?.size).toBe(undefined);
});
