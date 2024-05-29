import {
  createConnectedEvent,
  createEmptyEndpoint,
  createSimulcastTrack,
  trackId,
} from '../fixtures';
import { Endpoint, WebRTCEndpoint } from '../../src';
import { expect, vi, it } from 'vitest';

it('Connecting to empty room produce event', () =>
  new Promise((done) => {
    const webRTCEndpoint = new WebRTCEndpoint();

    const connectedEvent = createConnectedEvent();

    webRTCEndpoint.on(
      'connected',
      (peerId: string, _peersInRoom: Endpoint<any, any>[]) => {
        expect(connectedEvent.data.id).toBe(peerId);
        expect(connectedEvent.data.otherEndpoints.length).toBe(0);
        done('');
      },
    );

    webRTCEndpoint.receiveMediaEvent(JSON.stringify(connectedEvent));
  }));

it('Connecting to empty room set internal state', () => () => {
  // Given
  const webRTCEndpoint = new WebRTCEndpoint();

  // When
  const connectedEvent = createConnectedEvent();
  webRTCEndpoint.receiveMediaEvent(JSON.stringify(connectedEvent));

  // Then
  const localEndpoint = webRTCEndpoint['localEndpoint'];
  expect(localEndpoint.id).toBe(connectedEvent.data.id);
});

it('Connecting to room with one peer', () =>
  new Promise((done) => {
    const webRTCEndpoint = new WebRTCEndpoint();

    const connectedEvent = createConnectedEvent();
    connectedEvent.data.otherEndpoints = [createEmptyEndpoint()];

    webRTCEndpoint.on(
      'connected',
      (peerId: string, _peersInRoom: Endpoint<any, any>[]) => {
        expect(connectedEvent.data.id).toBe(peerId);
        expect(connectedEvent.data.otherEndpoints.length).toBe(
          connectedEvent.data.otherEndpoints.length,
        );
        done('');
      },
    );

    webRTCEndpoint.receiveMediaEvent(JSON.stringify(connectedEvent));
  }));

it('Connecting to room with one peer with one track', () =>
  new Promise((done) => {
    // Given
    const webRTCEndpoint = new WebRTCEndpoint();
    const trackAddedCallback = vi.fn((_x) => null);
    const connectedCallback = vi.fn((_peerId, _peersInRoom) => null);

    const connectedEvent = createConnectedEvent();
    connectedEvent.data.otherEndpoints = [createEmptyEndpoint()];
    const endpoint = connectedEvent.data.otherEndpoints[0];

    endpoint.tracks[trackId] = createSimulcastTrack();
    endpoint.trackIdToMetadata[trackId] = {};

    webRTCEndpoint.on(
      'connected',
      (peerId: string, peersInRoom: Endpoint<any, any>[]) => {
        connectedCallback(peerId, peersInRoom);
        expect(peerId).toBe(connectedEvent.data.id);
        expect(peersInRoom.length).toBe(
          connectedEvent.data.otherEndpoints.length,
        );
      },
    );

    webRTCEndpoint.on('trackAdded', (ctx) => {
      trackAddedCallback(ctx);
      expect(ctx.trackId).toBe(trackId);
      expect(ctx.simulcastConfig?.enabled).toBe(
        endpoint.tracks[trackId].simulcastConfig.enabled,
      );
      done('');
    });

    // When
    webRTCEndpoint.receiveMediaEvent(JSON.stringify(connectedEvent));

    // Then
    const remoteTracks = webRTCEndpoint.getRemoteTracks();
    expect(Object.values(remoteTracks).length).toBe(1);

    expect(trackAddedCallback.mock.calls).toHaveLength(1);
    expect(connectedCallback.mock.calls).toHaveLength(1);
  }));
