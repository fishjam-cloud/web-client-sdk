import { expect, it, vi } from 'vitest';

import { WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
import { Remote } from '../../src/tracks/Remote';
import { RemoteTrack } from '../../src/tracks/RemoteTrack';
import {
  createAddTrackMediaEvent,
  createConnectedEventWithOneEndpoint,
  createCustomOfferDataEventWithOneVideoTrack,
  createEndpointRemoved,
  createTracksRemovedEvent,
  exampleEndpointId,
  exampleTrackId,
} from '../fixtures';
import { mockRTCPeerConnection } from '../mocks';

const emitNoop = () => {};
const sendNoop = () => {};

it('Remote.getTrackByMidOrNull returns null for unknown mid', () => {
  const remote = new Remote(emitNoop as any, sendNoop as any);
  expect(remote.getTrackByMidOrNull('42')).toBeNull();
});

it('Remote.getTrackByMidOrNull returns track when mid matches', () => {
  const remote = new Remote(emitNoop as any, sendNoop as any);
  const trackId = 'trackA';
  const remoteTrack = new RemoteTrack(trackId, { endpoint: { id: 'e1' } } as any);
  remoteTrack.setMLineId('3');
  (remote as any).remoteTracks[trackId] = remoteTrack;

  expect(remote.getTrackByMidOrNull('3')).toBe(remoteTrack);
  expect(remote.getTrackByMidOrNull('4')).toBeNull();
});

it('endpointRemoved during in-flight renegotiation is deferred until sdpAnswer', async () => {
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  const connected = createConnectedEventWithOneEndpoint(exampleEndpointId);
  await webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ connected }));

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ tracksAdded: createAddTrackMediaEvent(exampleEndpointId, exampleTrackId) }),
  );

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ offerData: createCustomOfferDataEventWithOneVideoTrack() }),
  );

  expect((webRTCEndpoint as any).localTrackManager.ongoingRenegotiation).toBe(true);

  const eventsBeforeAnswer: string[] = [];
  webRTCEndpoint.on('trackRemoved', () => eventsBeforeAnswer.push('trackRemoved'));
  webRTCEndpoint.on('endpointRemoved', () => eventsBeforeAnswer.push('endpointRemoved'));

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ endpointRemoved: createEndpointRemoved(exampleEndpointId) }),
  );

  expect(eventsBeforeAnswer).toEqual([]);
  expect(Object.keys(webRTCEndpoint.getRemoteEndpoints())).toContain(exampleEndpointId);
  expect(Object.keys(webRTCEndpoint.getRemoteTracks())).toContain(exampleTrackId);
  expect((webRTCEndpoint as any).pendingRemovals.length).toBe(1);

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({
      sdpAnswer: { sdp: 'v=0\r\n', midToTrackId: {}, type: 'answer' } as any,
    }),
  );

  expect(eventsBeforeAnswer).toEqual(['trackRemoved', 'endpointRemoved']);
  expect(Object.keys(webRTCEndpoint.getRemoteEndpoints())).not.toContain(exampleEndpointId);
  expect(Object.keys(webRTCEndpoint.getRemoteTracks())).not.toContain(exampleTrackId);
  expect((webRTCEndpoint as any).pendingRemovals.length).toBe(0);
  expect((webRTCEndpoint as any).localTrackManager.ongoingRenegotiation).toBe(false);
});

it('tracksRemoved during in-flight renegotiation is deferred until sdpAnswer', async () => {
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint(exampleEndpointId) }),
  );
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ tracksAdded: createAddTrackMediaEvent(exampleEndpointId, exampleTrackId) }),
  );
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ offerData: createCustomOfferDataEventWithOneVideoTrack() }),
  );

  const removed: string[] = [];
  webRTCEndpoint.on('trackRemoved', (ctx) => removed.push(ctx.trackId));

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ tracksRemoved: createTracksRemovedEvent(exampleEndpointId, [exampleTrackId]) }),
  );

  expect(removed).toEqual([]);
  expect(Object.keys(webRTCEndpoint.getRemoteTracks())).toContain(exampleTrackId);

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({
      sdpAnswer: { sdp: 'v=0\r\n', midToTrackId: {}, type: 'answer' } as any,
    }),
  );

  expect(removed).toEqual([exampleTrackId]);
  expect(Object.keys(webRTCEndpoint.getRemoteTracks())).not.toContain(exampleTrackId);
});

it('ontrack for a mid without a RemoteTrack warns and does not throw (seq-8 race)', async () => {
  mockRTCPeerConnection();
  const webRTCEndpoint = new WebRTCEndpoint();

  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint(exampleEndpointId) }),
  );
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ tracksAdded: createAddTrackMediaEvent(exampleEndpointId, exampleTrackId) }),
  );
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ offerData: createCustomOfferDataEventWithOneVideoTrack() }),
  );

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ endpointRemoved: createEndpointRemoved(exampleEndpointId) }),
  );

  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({
      sdpAnswer: { sdp: 'v=0\r\n', midToTrackId: {}, type: 'answer' } as any,
    }),
  );

  const orphanTransceiver = { mid: '7' } as unknown as RTCRtpTransceiver;
  const trackReadySpy = vi.fn();
  webRTCEndpoint.on('trackReady', trackReadySpy);

  const connection = (webRTCEndpoint as any).connectionManager.getConnection();

  expect(() =>
    connection.ontrack({
      streams: [{} as MediaStream],
      transceiver: orphanTransceiver,
      track: { kind: 'video' } as MediaStreamTrack,
    } as unknown as RTCTrackEvent),
  ).not.toThrow();

  expect(trackReadySpy).not.toHaveBeenCalled();
  warnSpy.mockRestore();
});
