import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
import { expect, it } from 'vitest';

import { WebRTCEndpoint } from '../../src';
import { deserializePeerMediaEvent, serializeServerMediaEvent } from '../../src/mediaEvent';
import {
  createAddLocalTracksAnswerData,
  createAddLocalTrackSDPOffer,
  createAddTrackMediaEvent,
  createConnectedEventWithOneEndpoint,
  createCustomOfferDataEventWithOneVideoTrack,
  exampleTrackId,
} from '../fixtures';
import { mockMediaStream, mockRTCPeerConnection } from '../mocks';

type PeerEvent = ReturnType<typeof deserializePeerMediaEvent>;

const connect = async () => {
  const webRTCEndpoint = new WebRTCEndpoint();

  const connected = createConnectedEventWithOneEndpoint();
  await webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected }));

  const sentEvents: PeerEvent[] = [];
  webRTCEndpoint.on('sendMediaEvent', (mediaEvent) => {
    sentEvents.push(deserializePeerMediaEvent(mediaEvent));
  });

  const renegotiationCount = () => sentEvents.filter((event) => event.renegotiateTracks).length;
  const offers = () => sentEvents.flatMap((event) => (event.sdpOffer ? [event.sdpOffer] : []));
  const localTrackIds = () => [...webRTCEndpoint['local'].getTrackIdToTrack().keys()];

  return { webRTCEndpoint, connected, sentEvents, renegotiationCount, offers, localTrackIds };
};

it('Two addTracks before offerData are negotiated in a single cycle', async () => {
  mockRTCPeerConnection();
  mockMediaStream();

  const { webRTCEndpoint, renegotiationCount, offers, localTrackIds } = await connect();

  const addA = webRTCEndpoint.addTrack(new FakeMediaStreamTrack({ kind: 'audio' }), { type: 'audio' });
  const addB = webRTCEndpoint.addTrack(new FakeMediaStreamTrack({ kind: 'video' }), { type: 'video' });

  // Only the first addTrack triggers renegotiation; the second rides the same one.
  expect(renegotiationCount()).toBe(1);

  await webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ offerData: createAddLocalTrackSDPOffer() }));

  // A single offer that carries both tracks.
  expect(offers()).toHaveLength(1);
  expect(Object.keys(offers()[0]!.trackIdToMetadataJson)).toHaveLength(2);
  expect(renegotiationCount()).toBe(1);

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ sdpAnswer: createAddLocalTracksAnswerData(localTrackIds()) }),
  );

  await expect(addA).resolves.toBeDefined();
  await expect(addB).resolves.toBeDefined();

  expect(renegotiationCount()).toBe(1);

  const contexts = [...webRTCEndpoint['local'].getTrackIdToTrack().values()];
  expect(contexts).toHaveLength(2);
  expect(contexts.every((context) => context.negotiationStatus === 'done')).toBe(true);
});

it('addTrack joins a remote-initiated negotiation without sending renegotiateTracks', async () => {
  mockRTCPeerConnection();
  mockMediaStream();

  const { webRTCEndpoint, connected, renegotiationCount, offers, localTrackIds } = await connect();

  const otherEndpointId = Object.keys(connected.endpointIdToEndpoint).find((id) => id !== connected.endpointId)!;

  // Remote endpoint adds a track -> sets ongoingRenegotiation, server will send offerData.
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ tracksAdded: createAddTrackMediaEvent(otherEndpointId, exampleTrackId) }),
  );

  const addA = webRTCEndpoint.addTrack(new FakeMediaStreamTrack({ kind: 'video' }), { type: 'video' });

  // The local track piggybacks on the remote-initiated negotiation, no extra renegotiateTracks.
  expect(renegotiationCount()).toBe(0);

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ offerData: createCustomOfferDataEventWithOneVideoTrack() }),
  );

  expect(offers()).toHaveLength(1);
  expect(Object.keys(offers()[0]!.trackIdToMetadataJson)).toHaveLength(1);

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ sdpAnswer: createAddLocalTracksAnswerData(localTrackIds()) }),
  );

  await expect(addA).resolves.toBeDefined();
  expect(renegotiationCount()).toBe(0);
});

it('addTrack after the offer was sent waits for the next cycle', async () => {
  mockRTCPeerConnection();
  mockMediaStream();

  const { webRTCEndpoint, renegotiationCount, offers, localTrackIds } = await connect();

  const addA = webRTCEndpoint.addTrack(new FakeMediaStreamTrack({ kind: 'audio' }), { type: 'audio' });
  expect(renegotiationCount()).toBe(1);

  await webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ offerData: createAddLocalTrackSDPOffer() }));

  expect(offers()).toHaveLength(1);
  expect(Object.keys(offers()[0]!.trackIdToMetadataJson)).toHaveLength(1);

  // B is added after the offer was already sent, so it cannot join that cycle.
  const addB = webRTCEndpoint.addTrack(new FakeMediaStreamTrack({ kind: 'video' }), { type: 'video' });
  expect(renegotiationCount()).toBe(1);
  expect(webRTCEndpoint['local'].getTrackIdToTrack().size).toBe(1);

  // The answer for A unblocks the queue; B then triggers a second renegotiation.
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ sdpAnswer: createAddLocalTracksAnswerData(localTrackIds()) }),
  );

  await expect(addA).resolves.toBeDefined();
  expect(renegotiationCount()).toBe(2);
  expect(webRTCEndpoint['local'].getTrackIdToTrack().size).toBe(2);

  // Second cycle covers B.
  await webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ offerData: createAddLocalTrackSDPOffer() }));
  expect(offers()).toHaveLength(2);
  expect(Object.keys(offers()[1]!.trackIdToMetadataJson)).toHaveLength(2);

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ sdpAnswer: createAddLocalTracksAnswerData(localTrackIds()) }),
  );

  await expect(addB).resolves.toBeDefined();
});

it('an error in one batched command rejects only that command', async () => {
  mockRTCPeerConnection();
  mockMediaStream();

  const { webRTCEndpoint, offers, localTrackIds } = await connect();

  const sharedTrack = new FakeMediaStreamTrack({ kind: 'video' });

  const addA = webRTCEndpoint.addTrack(sharedTrack, { type: 'A' });
  const addB = webRTCEndpoint.addTrack(sharedTrack, { type: 'B' });

  // Attach the rejection expectation before the drain so the rejection is never unhandled.
  const addBRejected = expect(addB).rejects.toThrow(
    "This track was already added to peerConnection, it can't be added again!",
  );

  await webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ offerData: createAddLocalTrackSDPOffer() }));

  await addBRejected;

  // The offer carries only the track that was added successfully.
  expect(offers()).toHaveLength(1);
  expect(Object.keys(offers()[0]!.trackIdToMetadataJson)).toHaveLength(1);

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ sdpAnswer: createAddLocalTracksAnswerData(localTrackIds()) }),
  );

  await expect(addA).resolves.toBeDefined();
});
