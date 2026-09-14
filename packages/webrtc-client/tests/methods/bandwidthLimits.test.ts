import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
import { afterEach, expect, it, vi } from 'vitest';

import { MAX_BANDWIDTH_LIMITS, Variant, WebRTCEndpoint } from '../../src';
import { resolveBandwidthLimit, resolveVariantBandwidthLimit } from '../../src/bitrate';
import { deserializePeerMediaEvent, serializeServerMediaEvent } from '../../src/mediaEvent';
import { clampSimulcastEncodings, encodingsToBandwidthLimit, splitBandwidth } from '../../src/tracks/bandwidth';
import { createTransceiverConfig } from '../../src/tracks/transceivers';
import { createAddLocalTrackSDPOffer, createConnectedEventWithOneEndpoint } from '../fixtures';
import { mockMediaStream, mockRTCPeerConnection } from '../mocks';

const KBPS = 1024;

const logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

afterEach(() => {
  vi.restoreAllMocks();
  logger.warn.mockClear();
});

it('resolveBandwidthLimit resolves 0 to the single-stream cap', () => {
  expect(resolveBandwidthLimit(0, logger)).toBe(MAX_BANDWIDTH_LIMITS.singleStream);
  expect(resolveBandwidthLimit(-5, logger)).toBe(MAX_BANDWIDTH_LIMITS.singleStream);
});

it('resolveBandwidthLimit keeps a single-stream value below the cap', () => {
  expect(resolveBandwidthLimit(800, logger)).toBe(800);
});

it('resolveBandwidthLimit lowers a single-stream value above the cap and warns', () => {
  expect(resolveBandwidthLimit(8000, logger)).toBe(MAX_BANDWIDTH_LIMITS.singleStream);
  expect(logger.warn).toHaveBeenCalledOnce();
});

it('resolveBandwidthLimit fills missing simulcast variants with caps and clamps the rest', () => {
  const limits = new Map<Variant, number>([
    [Variant.VARIANT_MEDIUM, 300],
    [Variant.VARIANT_HIGH, 9000],
  ]);

  const resolved = resolveBandwidthLimit(limits, logger) as Map<Variant, number>;

  expect(resolved.get(Variant.VARIANT_LOW)).toBe(MAX_BANDWIDTH_LIMITS.simulcast[Variant.VARIANT_LOW]);
  expect(resolved.get(Variant.VARIANT_MEDIUM)).toBe(300);
  expect(resolved.get(Variant.VARIANT_HIGH)).toBe(MAX_BANDWIDTH_LIMITS.simulcast[Variant.VARIANT_HIGH]);
});

it('resolveVariantBandwidthLimit uses the cap of the given variant', () => {
  expect(resolveVariantBandwidthLimit(Variant.VARIANT_LOW, 1000, logger)).toBe(
    MAX_BANDWIDTH_LIMITS.simulcast[Variant.VARIANT_LOW],
  );
  expect(resolveVariantBandwidthLimit(Variant.VARIANT_HIGH, 1000, logger)).toBe(1000);
});

it('resolveVariantBandwidthLimit rejects a variant that has no simulcast layer', () => {
  expect(() => resolveVariantBandwidthLimit(Variant.VARIANT_UNSPECIFIED, 1000, logger)).toThrow();
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

it('addTrack on a simulcast track without a limit resolves to a Map of the per-variant caps', async () => {
  mockRTCPeerConnection();
  mockMediaStream();
  const { webRTCEndpoint } = await connect();

  webRTCEndpoint.addTrack(new FakeMediaStreamTrack({ kind: 'video' }), undefined, {
    enabled: true,
    enabledVariants: [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH],
    disabledVariants: [],
  });

  const [video] = trackContexts(webRTCEndpoint);
  const caps = new Map(
    Object.entries(MAX_BANDWIDTH_LIMITS.simulcast).map(([variant, limit]) => [Number(variant), limit]),
  );
  expect(video!.maxBandwidth).toEqual(caps);
  expect(() => createTransceiverConfig(video!, logger)).not.toThrow();
});

it('addTrack clamps a simulcast limit above the cap', async () => {
  mockRTCPeerConnection();
  mockMediaStream();
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

  webRTCEndpoint.addTrack(
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
  webRTCEndpoint.addTrack(new FakeMediaStreamTrack({ kind: 'video' }), { type: 'screen' }, undefined, 900);
  webRTCEndpoint.addTrack(new FakeMediaStreamTrack({ kind: 'audio' }), { type: 'audio' });
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

it('encodingsToBandwidthLimit keeps a per-variant Map for simulcast encodings', () => {
  const encodings = splitBandwidth(
    [
      { rid: 'l', scaleResolutionDownBy: 4 },
      { rid: 'm', scaleResolutionDownBy: 2 },
      { rid: 'h', scaleResolutionDownBy: 1 },
    ],
    1500,
    logger,
  );

  const limit = encodingsToBandwidthLimit(encodings, 1500) as Map<Variant, number>;

  expect(limit).toBeInstanceOf(Map);
  expect([...limit.keys()]).toEqual([Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH]);
  // 1500 split by pixel count: 1 : 4 : 16 → 71 / 286 / 1143 kbps
  expect(limit.get(Variant.VARIANT_LOW)).toBe(71);
  expect(limit.get(Variant.VARIANT_MEDIUM)).toBe(286);
  expect(limit.get(Variant.VARIANT_HIGH)).toBe(1143);
});

it('encodingsToBandwidthLimit returns the number for a single-stream track', () => {
  expect(encodingsToBandwidthLimit([{ maxBitrate: 900 * KBPS }], 900)).toBe(900);
});

it('setTrackBandwidth passes audio values through and caps video values', async () => {
  mockRTCPeerConnection();
  mockMediaStream();
  const { webRTCEndpoint } = await connect();

  webRTCEndpoint.addTrack(new FakeMediaStreamTrack({ kind: 'audio' }));
  webRTCEndpoint.addTrack(new FakeMediaStreamTrack({ kind: 'video' }));
  await webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ offerData: createAddLocalTrackSDPOffer() }));

  const [audio, video] = trackContexts(webRTCEndpoint);
  await webRTCEndpoint.setTrackBandwidth(audio!.trackId, 5000);
  await webRTCEndpoint.setTrackBandwidth(video!.trackId, 5000);

  expect(audio!.maxBandwidth).toBe(5000);
  expect(video!.maxBandwidth).toBe(MAX_BANDWIDTH_LIMITS.singleStream);
});

it('clampSimulcastEncodings lowers each layer to the cap of its variant', () => {
  const encodings = clampSimulcastEncodings(
    [
      { rid: 'l', maxBitrate: 1000 * KBPS },
      { rid: 'm', maxBitrate: 400 * KBPS },
      { rid: 'h', maxBitrate: 3000 * KBPS },
    ],
    logger,
  );

  expect(encodings.map((encoding) => encoding.maxBitrate)).toEqual([150 * KBPS, 400 * KBPS, 1500 * KBPS]);
  expect(logger.warn).toHaveBeenCalledTimes(2);
});

const ALL_VARIANTS = [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH];

const connectWithSimulcastTrack = async () => {
  mockRTCPeerConnection();
  mockMediaStream();
  const { webRTCEndpoint } = await connect();

  webRTCEndpoint.addTrack(new FakeMediaStreamTrack({ kind: 'video' }), undefined, {
    enabled: true,
    enabledVariants: ALL_VARIANTS,
    disabledVariants: [],
  });
  await webRTCEndpoint.receiveMediaEvent(serializeServerMediaEvent({ offerData: createAddLocalTrackSDPOffer() }));

  const [video] = trackContexts(webRTCEndpoint);
  return { webRTCEndpoint, trackId: video!.trackId, limits: () => video!.maxBandwidth as Map<Variant, number> };
};

it('setTrackBandwidth(0) on a simulcast track sets every layer to its cap', async () => {
  const { webRTCEndpoint, trackId, limits } = await connectWithSimulcastTrack();

  await webRTCEndpoint.setTrackBandwidth(trackId, 0);

  expect(limits().get(Variant.VARIANT_LOW)).toBe(150);
  expect(limits().get(Variant.VARIANT_MEDIUM)).toBe(500);
  expect(limits().get(Variant.VARIANT_HIGH)).toBe(1500);
});

it('setTrackBandwidth on a simulcast track lets the high layer reach its full cap', async () => {
  const { webRTCEndpoint, trackId, limits } = await connectWithSimulcastTrack();

  // 2100 split 1 : 4 : 16 → 100 / 400 / 1600, then the high layer is clamped to 1500
  await webRTCEndpoint.setTrackBandwidth(trackId, 2100);

  expect(limits().get(Variant.VARIANT_LOW)).toBe(100);
  expect(limits().get(Variant.VARIANT_MEDIUM)).toBe(400);
  expect(limits().get(Variant.VARIANT_HIGH)).toBe(1500);
});

it('setTrackBandwidth on a simulcast track clamps every layer when the budget is huge', async () => {
  const { webRTCEndpoint, trackId, limits } = await connectWithSimulcastTrack();

  await webRTCEndpoint.setTrackBandwidth(trackId, 100_000);

  expect(limits().get(Variant.VARIANT_LOW)).toBe(150);
  expect(limits().get(Variant.VARIANT_MEDIUM)).toBe(500);
  expect(limits().get(Variant.VARIANT_HIGH)).toBe(1500);
});
