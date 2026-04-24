import { expect, it } from 'vitest';

import { WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
import {
  createAddTrackMediaEvent,
  createAnswerData,
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
