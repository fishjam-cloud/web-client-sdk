import { faker } from '@faker-js/faker';
import { expect, it, vi } from 'vitest';

import type { Endpoint } from '../../src';
import { WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
import { createConnectedEvent, createEmptyEndpoint, createTrackWithSimulcast, exampleTrackId } from '../fixtures';

it('Connecting to empty room produce event', () =>
  new Promise((done) => {
    const webRTCEndpoint = new WebRTCEndpoint();

    const connected = createConnectedEvent();

    webRTCEndpoint.on('connected', (peerId: string, _peersInRoom: Endpoint[]) => {
      expect(connected.endpointId).toBe(peerId);
      expect(Object.keys(connected.endpointIdToEndpoint).length).toBe(1);
      done('');
    });

    webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected }));
  }));

it('Connecting to empty room set internal state', () => () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  // When
  const connected = createConnectedEvent();
  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected }));

  // Then
  const localEndpointId = webRTCEndpoint['getEndpointId']();
  expect(localEndpointId).toBe(connected.endpointId);
});

it('Connecting to room with one peer', () =>
  new Promise((done) => {
    const webRTCEndpoint = new WebRTCEndpoint();

    const connected = createConnectedEvent();
    connected.endpointIdToEndpoint = {
      ...connected.endpointIdToEndpoint,
      [faker.string.uuid()]: createEmptyEndpoint(),
    };

    webRTCEndpoint.on('connected', (peerId: string, _peersInRoom: Endpoint[]) => {
      expect(connected.endpointId).toBe(peerId);
      expect(Object.keys(connected.endpointIdToEndpoint).length).toBe(2);
      done('');
    });

    webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected }));
  }));

it('Connecting to room with one peer with one track', () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();
    const trackAddedCallback = vi.fn((_x) => null);
    const connectedCallback = vi.fn((_peerId, _peersInRoom) => null);

    const connected = createConnectedEvent();

    const otherEndpoint = createEmptyEndpoint();

    otherEndpoint.trackIdToTrack = { [exampleTrackId]: createTrackWithSimulcast() };

    connected.endpointIdToEndpoint = {
      ...connected.endpointIdToEndpoint,
      [faker.string.uuid()]: otherEndpoint,
    };

    webRTCEndpoint.on('connected', (peerId: string, remotePeersInRoom: Endpoint[]) => {
      connectedCallback(peerId, remotePeersInRoom);
      expect(peerId).toBe(connected.endpointId);
      expect(remotePeersInRoom.length).toBe(1);
    });

    webRTCEndpoint.on('trackAdded', (ctx) => {
      trackAddedCallback(ctx);
      expect(ctx.trackId).toBe(exampleTrackId);
      expect(ctx.simulcastConfig?.enabled).toBe(otherEndpoint.trackIdToTrack[exampleTrackId]!.simulcastConfig?.enabled);
      done('');
    });

    // When
    webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected }));

    // Then
    const remoteTracks = webRTCEndpoint.getRemoteTracks();
    expect(Object.values(remoteTracks).length).toBe(1);

    expect(trackAddedCallback.mock.calls).toHaveLength(1);
    expect(connectedCallback.mock.calls).toHaveLength(1);
  }));
