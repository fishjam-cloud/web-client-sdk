import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
import { afterEach, expect, it, vi } from 'vitest';

import { MAX_BANDWIDTH_LIMITS, Variant, WebRTCEndpoint } from '../../src';
import { resolveBandwidthLimit, resolveVariantBandwidthLimit } from '../../src/bitrate';
import { deserializePeerMediaEvent, serializeServerMediaEvent } from '../../src/mediaEvent';
import { createAddLocalTrackSDPOffer, createConnectedEventWithOneEndpoint } from '../fixtures';
import { mockMediaStream, mockRTCPeerConnection } from '../mocks';

const KBPS = 1024;

afterEach(() => {
  vi.restoreAllMocks();
});

it('resolveBandwidthLimit resolves 0 to the single-stream cap', () => {
  expect(resolveBandwidthLimit(0)).toBe(MAX_BANDWIDTH_LIMITS.singleStream);
  expect(resolveBandwidthLimit(-5)).toBe(MAX_BANDWIDTH_LIMITS.singleStream);
});

it('resolveBandwidthLimit keeps a single-stream value below the cap', () => {
  expect(resolveBandwidthLimit(800)).toBe(800);
});

it('resolveBandwidthLimit lowers a single-stream value above the cap and warns', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(resolveBandwidthLimit(8000)).toBe(MAX_BANDWIDTH_LIMITS.singleStream);
  expect(warn).toHaveBeenCalledOnce();
});

it('resolveBandwidthLimit fills missing simulcast variants with caps and clamps the rest', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const limits = new Map<Variant, number>([
    [Variant.VARIANT_MEDIUM, 300],
    [Variant.VARIANT_HIGH, 9000],
  ]);

  const resolved = resolveBandwidthLimit(limits) as Map<Variant, number>;

  expect(resolved.get(Variant.VARIANT_LOW)).toBe(MAX_BANDWIDTH_LIMITS.simulcast[Variant.VARIANT_LOW]);
  expect(resolved.get(Variant.VARIANT_MEDIUM)).toBe(300);
  expect(resolved.get(Variant.VARIANT_HIGH)).toBe(MAX_BANDWIDTH_LIMITS.simulcast[Variant.VARIANT_HIGH]);
});

it('resolveVariantBandwidthLimit uses the cap of the given variant', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(resolveVariantBandwidthLimit(Variant.VARIANT_LOW, 1000)).toBe(
    MAX_BANDWIDTH_LIMITS.simulcast[Variant.VARIANT_LOW],
  );
  expect(resolveVariantBandwidthLimit(Variant.VARIANT_HIGH, 1000)).toBe(1000);
});

const connect = async () => {
  const webRTCEndpoint = new WebRTCEndpoint();
  await webRTCEndpoint.receiveMediaEvent(
    serializeServerMediaEvent({ connected: createConnectedEventWithOneEndpoint() }),
  );

  const offers: ReturnType<typeof deserializePeerMediaEvent>['sdpOffer'][] = [];
  webRTCEndpoint.on('sendMediaEvent', (mediaEvent) => {
    const event = deserializePeerMediaEvent(mediaEvent);
    if (event.sdpOffer) offers.push(event.sdpOffer);
  });

  return { webRTCEndpoint, offers };
};

const trackContexts = (webRTCEndpoint: WebRTCEndpoint) => [...webRTCEndpoint['local'].getTrackIdToTrack().values()];

it('addTrack without a limit uses the single-stream cap for video and no limit for audio', async () => {
  mockRTCPeerConnection();
  mockMediaStream();
  const { webRTCEndpoint } = await connect();

  webRTCEndpoint.addTrack(new FakeMediaStreamTrack({ kind: 'video' }));
  webRTCEndpoint.addTrack(new FakeMediaStreamTrack({ kind: 'audio' }));
  await webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ offerData: createAddLocalTrackSDPOffer() }));

  const [video, audio] = trackContexts(webRTCEndpoint);
  expect(video!.maxBandwidth).toBe(MAX_BANDWIDTH_LIMITS.singleStream);
  expect(audio!.maxBandwidth).toBe(0);
});

it('addTrack clamps a simulcast limit above the cap', async () => {
  mockRTCPeerConnection();
  mockMediaStream();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { webRTCEndpoint } = await connect();

  webRTCEndpoint.addTrack(
    new FakeMediaStreamTrack({ kind: 'video' }),
    undefined,
    { enabled: true, enabledVariants: [Variant.VARIANT_LOW, Variant.VARIANT_HIGH], disabledVariants: [] },
    new Map([[Variant.VARIANT_HIGH, 6000]]),
  );

  const [video] = trackContexts(webRTCEndpoint);
  const limits = video!.maxBandwidth as Map<Variant, number>;
  expect(limits.get(Variant.VARIANT_HIGH)).toBe(MAX_BANDWIDTH_LIMITS.simulcast[Variant.VARIANT_HIGH]);
  expect(limits.get(Variant.VARIANT_LOW)).toBe(MAX_BANDWIDTH_LIMITS.simulcast[Variant.VARIANT_LOW]);
});

it('SDP offer reports the configured bitrates per variant in bps', async () => {
  mockRTCPeerConnection();
  mockMediaStream();
  const { webRTCEndpoint, offers } = await connect();

  const simulcastTrack = webRTCEndpoint.addTrack(
    new FakeMediaStreamTrack({ kind: 'video' }),
    { type: 'camera' },
    {
      enabled: true,
      enabledVariants: [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH],
      disabledVariants: [],
    },
    new Map([
      [Variant.VARIANT_LOW, 100],
      [Variant.VARIANT_MEDIUM, 400],
      [Variant.VARIANT_HIGH, 1200],
    ]),
  );
  const singleTrack = webRTCEndpoint.addTrack(
    new FakeMediaStreamTrack({ kind: 'video' }),
    { type: 'screen' },
    undefined,
    900,
  );
  const audioTrack = webRTCEndpoint.addTrack(new FakeMediaStreamTrack({ kind: 'audio' }), { type: 'audio' });
  void simulcastTrack;
  void singleTrack;
  void audioTrack;

  await webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ offerData: createAddLocalTrackSDPOffer() }));

  expect(offers).toHaveLength(1);
  const bitrates = offers[0]!.trackIdToBitrates;
  const [simulcastId, singleId, audioId] = trackContexts(webRTCEndpoint).map((t) => t.trackId);

  expect(bitrates[simulcastId!]!.variantBitrates).toEqual([
    { variant: Variant.VARIANT_LOW, bitrate: 100 * KBPS },
    { variant: Variant.VARIANT_MEDIUM, bitrate: 400 * KBPS },
    { variant: Variant.VARIANT_HIGH, bitrate: 1200 * KBPS },
  ]);
  expect(bitrates[singleId!]!.variantBitrates).toEqual([{ variant: Variant.VARIANT_UNSPECIFIED, bitrate: 900 * KBPS }]);
  expect(bitrates[audioId!]!.variantBitrates).toEqual([{ variant: Variant.VARIANT_UNSPECIFIED, bitrate: 50_000 }]);
});
