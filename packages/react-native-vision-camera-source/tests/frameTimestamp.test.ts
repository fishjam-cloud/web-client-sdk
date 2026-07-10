import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createFrameTimestampState,
  type FrameTimestampState,
  nextFrameTimestampNanoseconds,
  normalizeFrameTimestampNanoseconds,
} from '../src/frameTimestamp';

// In-memory stand-in for react-native-worklets' Synchronizable (the real implementation needs a
// native runtime; vitest hoists this mock above the imports). Faithful to the surface
// frameTimestamp uses: getBlocking + setBlocking.
vi.mock('react-native-worklets', () => ({
  createSynchronizable: <TValue>(initialValue: TValue) => {
    let value = initialValue;
    return {
      getBlocking: () => value,
      setBlocking: (next: TValue | ((previous: TValue) => TValue)) => {
        value = typeof next === 'function' ? (next as (previous: TValue) => TValue)(value) : next;
      },
    };
  },
}));

const NANOSECONDS_PER_SECOND = 1e9;

let state: FrameTimestampState;
beforeEach(() => {
  state = createFrameTimestampState();
});

describe('normalizeFrameTimestampNanoseconds', () => {
  it('rejects unusable timestamps (invalid frames report 0)', () => {
    expect(normalizeFrameTimestampNanoseconds(state, 0)).toBeNull();
    expect(normalizeFrameTimestampNanoseconds(state, -5)).toBeNull();
    expect(normalizeFrameTimestampNanoseconds(state, Number.NaN)).toBeNull();
  });

  it('treats iOS CMTime seconds as seconds and preserves inter-frame gaps in nanoseconds', () => {
    // Typical iOS values: seconds since boot, ~1e5–1e6.
    const firstSeconds = 123456.5;
    const secondSeconds = 123456.5334;
    expect(normalizeFrameTimestampNanoseconds(state, firstSeconds)).toBe(0);
    expect(normalizeFrameTimestampNanoseconds(state, secondSeconds)).toBe(
      secondSeconds * NANOSECONDS_PER_SECOND - firstSeconds * NANOSECONDS_PER_SECOND,
    );
  });

  it('treats Android CameraX nanoseconds as nanoseconds after long uptime', () => {
    // ~28 hours of uptime, 33 ms apart.
    const firstNanoseconds = 1e14;
    expect(normalizeFrameTimestampNanoseconds(state, firstNanoseconds)).toBe(0);
    expect(normalizeFrameTimestampNanoseconds(state, firstNanoseconds + 33_000_000)).toBe(33_000_000);
  });

  it('treats Android nanoseconds as nanoseconds on a recently booted device (regression)', () => {
    // 2 minutes of uptime: 1.2e11 ns. The old 1e12 threshold misclassified this as seconds and
    // scaled a 33 ms gap into ~380 days of timeline.
    const firstNanoseconds = 1.2e11;
    expect(normalizeFrameTimestampNanoseconds(state, firstNanoseconds)).toBe(0);
    expect(normalizeFrameTimestampNanoseconds(state, firstNanoseconds + 33_000_000)).toBe(33_000_000);
  });

  it('stays continuous when an Android stream crosses a magnitude boundary mid-stream', () => {
    // Frames straddling 1e12 ns (~16.7 min of uptime) — the old threshold flipped units here.
    const beforeBoundary = 1e12 - 16_000_000;
    const afterBoundary = 1e12 + 17_000_000;
    expect(normalizeFrameTimestampNanoseconds(state, beforeBoundary)).toBe(0);
    expect(normalizeFrameTimestampNanoseconds(state, afterBoundary)).toBe(33_000_000);
  });

  it('rejects timestamps that do not advance the timeline', () => {
    expect(normalizeFrameTimestampNanoseconds(state, 1e14)).toBe(0);
    expect(normalizeFrameTimestampNanoseconds(state, 1e14)).toBeNull();
    expect(normalizeFrameTimestampNanoseconds(state, 1e14 - 1_000_000)).toBeNull();
    // A later frame that does advance is accepted again.
    expect(normalizeFrameTimestampNanoseconds(state, 1e14 + 1_000_000)).toBe(1_000_000);
  });
});

describe('nextFrameTimestampNanoseconds', () => {
  const frameIntervalNanoseconds = 33_333_333;

  it('passes real timestamps through', () => {
    expect(nextFrameTimestampNanoseconds(state, 1e14, frameIntervalNanoseconds)).toBe(0);
    expect(nextFrameTimestampNanoseconds(state, 1e14 + 40_000_000, frameIntervalNanoseconds)).toBe(40_000_000);
  });

  it('paces by the frame interval when frames carry no timestamp', () => {
    expect(nextFrameTimestampNanoseconds(state, 0, frameIntervalNanoseconds)).toBe(0);
    expect(nextFrameTimestampNanoseconds(state, 0, frameIntervalNanoseconds)).toBe(frameIntervalNanoseconds);
    expect(nextFrameTimestampNanoseconds(state, 0, frameIntervalNanoseconds)).toBe(2 * frameIntervalNanoseconds);
  });

  it('stays monotonic when real timestamps appear after interval-paced frames (documented quirk)', () => {
    const paced = nextFrameTimestampNanoseconds(state, 0, frameIntervalNanoseconds);
    const pacedAgain = nextFrameTimestampNanoseconds(state, 0, frameIntervalNanoseconds);
    // First real timestamp becomes the baseline (offset 0), which is behind the paced timeline —
    // so it falls back to interval pacing rather than jumping backwards.
    const afterRealTimestamp = nextFrameTimestampNanoseconds(state, 1e14, frameIntervalNanoseconds);
    expect(paced).toBe(0);
    expect(pacedAgain).toBeGreaterThan(paced);
    expect(afterRealTimestamp).toBeGreaterThan(pacedAgain);
  });
});
