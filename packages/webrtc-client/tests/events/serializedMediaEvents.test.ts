import { expect, it } from 'vitest';

import { WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
import {
  createAddTrackMediaEvent,
  createAnswerData,
  createConnectedEvent,
  createConnectedEventWithOneEndpoint,
  createCustomOfferDataEventWithOneVideoTrack,
  exampleTrackId,
} from '../fixtures';

it('offerData that arrives while a previous sdpAnswer is still applying waits for it', async () => {
  const webRTCEndpoint = new WebRTCEndpoint();

  let resolveRemoteDescription: (() => void) | undefined;
  const srdPromise = new Promise<void>((resolve) => {
    resolveRemoteDescription = resolve;
  });

  (global as any).RTCPeerConnection = class {
    addTransceiver() {
      return {
        mid: 'someMid',
        direction: 'recvonly',
        currentDirection: 'recvonly',
        receiver: { track: { kind: 'video' } },
        sender: { track: null },
        stop: () => {},
      };
    }
    getTransceivers() {
      return [];
    }
    getSenders() {
      return [];
    }
    createOffer() {
      return Promise.resolve({ sdp: '', type: 'offer' } as RTCSessionDescriptionInit);
    }
    setLocalDescription() {
      return Promise.resolve();
    }
    setRemoteDescription() {
      return srdPromise;
    }
    close() {}
    addEventListener() {}
    removeEventListener() {}
  };

  const connected = createConnectedEventWithOneEndpoint();
  webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected }));

  const otherEndpointId = Object.keys(connected.endpointIdToEndpoint).find((id) => id !== connected.endpointId)!;
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ tracksAdded: createAddTrackMediaEvent(otherEndpointId, exampleTrackId) }),
  );
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ offerData: createCustomOfferDataEventWithOneVideoTrack() }),
  );

  const order: string[] = [];
  const answerProcessed = webRTCEndpoint
    .receiveMediaEvent(serializeServerMediaEvent({ sdpAnswer: createAnswerData(exampleTrackId) }))
    .then(() => order.push('answer'));

  const secondOffer = webRTCEndpoint
    .receiveMediaEvent(serializeServerMediaEvent({ offerData: createCustomOfferDataEventWithOneVideoTrack() }))
    .then(() => order.push('offer'));

  await Promise.resolve();
  await Promise.resolve();
  expect(order).toEqual([]);

  resolveRemoteDescription!();
  await Promise.all([answerProcessed, secondOffer]);

  expect(order).toEqual(['answer', 'offer']);
});

it('drops media events received before connected and processes subsequent ones', async () => {
  const webRTCEndpoint = new WebRTCEndpoint();

  const connected = createConnectedEventWithOneEndpoint();
  const otherEndpointId = Object.keys(connected.endpointIdToEndpoint).find((id) => id !== connected.endpointId)!;

  let trackAddedCount = 0;
  webRTCEndpoint.on('trackAdded', () => {
    trackAddedCount++;
  });

  const preConnect = webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ tracksAdded: createAddTrackMediaEvent(otherEndpointId, exampleTrackId) }),
  );
  const connectedProcessed = webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected }));

  await Promise.all([preConnect, connectedProcessed]);

  expect(trackAddedCount).toBe(0);
  expect(webRTCEndpoint.getLocalEndpoint().id).toBe(connected.endpointId);

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ tracksAdded: createAddTrackMediaEvent(otherEndpointId, exampleTrackId) }),
  );

  expect(trackAddedCount).toBe(1);
});

it('processes connected in order after previously queued events', async () => {
  const webRTCEndpoint = new WebRTCEndpoint();

  const firstConnected = createConnectedEvent();
  const secondConnected = createConnectedEvent();

  const observed: string[] = [];
  webRTCEndpoint.on('connected', (endpointId) => {
    observed.push(endpointId);
  });

  const first = webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected: firstConnected }));
  const second = webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected: secondConnected }));

  await Promise.all([first, second]);

  expect(observed).toEqual([firstConnected.endpointId, secondConnected.endpointId]);
});
