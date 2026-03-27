import { expect, it, vi } from 'vitest';

import { WebRTCEndpoint } from '../../src';
import { serializeServerMediaEvent } from '../../src/mediaEvent';
import { createConnectedEventWithOneEndpoint, mockTrack } from '../fixtures';
import { mockMediaStream, mockRTCPeerConnection } from '../mocks';

it('getLocalTrackAudioLevel returns null for unknown track id', async () => {
  const webRTCEndpoint = new WebRTCEndpoint();
  const serializedEvent = serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint() });
  webRTCEndpoint.receiveMediaEvent(serializedEvent);

  const result = await webRTCEndpoint.getLocalTrackAudioLevel('non-existent-track-id');

  expect(result).toBeNull();
});

it('getLocalTrackAudioLevel returns null when track has no sender', async () => {
  mockRTCPeerConnection();
  mockMediaStream();

  const webRTCEndpoint = new WebRTCEndpoint();
  const serializedEvent = serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint() });
  webRTCEndpoint.receiveMediaEvent(serializedEvent);
  webRTCEndpoint.addTrack(mockTrack);

  const [trackId] = Object.keys(webRTCEndpoint['local']['localTracks']);

  const result = await webRTCEndpoint.getLocalTrackAudioLevel(trackId!);

  // sender is not set until offer/answer exchange, so getAudioLevel returns null
  expect(result).toBeNull();
});

it('getLocalTrackAudioLevel returns audio level from sender stats', async () => {
  mockRTCPeerConnection();
  mockMediaStream();

  const webRTCEndpoint = new WebRTCEndpoint();
  const serializedEvent = serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint() });
  webRTCEndpoint.receiveMediaEvent(serializedEvent);
  webRTCEndpoint.addTrack(mockTrack);

  const [trackId] = Object.keys(webRTCEndpoint['local']['localTracks']);
  const localTrack = webRTCEndpoint['local']['localTracks'][trackId!];

  const statsMap = new Map([['report-1', { type: 'media-source', kind: 'audio', audioLevel: 0.42 }]]);
  localTrack!['sender'] = { getStats: vi.fn().mockResolvedValue(statsMap) } as any;

  const result = await webRTCEndpoint.getLocalTrackAudioLevel(trackId!);

  expect(result).toEqual({ level: 0.42 });
});

it('getLocalTrackAudioLevel returns null when stats have no audio media-source report', async () => {
  mockRTCPeerConnection();
  mockMediaStream();

  const webRTCEndpoint = new WebRTCEndpoint();
  const serializedEvent = serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint() });
  webRTCEndpoint.receiveMediaEvent(serializedEvent);
  webRTCEndpoint.addTrack(mockTrack);

  const [trackId] = Object.keys(webRTCEndpoint['local']['localTracks']);
  const localTrack = webRTCEndpoint['local']['localTracks'][trackId!];

  const statsMap = new Map([['report-1', { type: 'media-source', kind: 'video', videoWidth: 1280 }]]);
  localTrack!['sender'] = { getStats: vi.fn().mockResolvedValue(statsMap) } as any;

  const result = await webRTCEndpoint.getLocalTrackAudioLevel(trackId!);

  expect(result).toBeNull();
});
